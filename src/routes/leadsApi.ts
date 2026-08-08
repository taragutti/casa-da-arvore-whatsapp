import { Router, Request, Response } from "express";
import { logger } from "../config/logger";
import { exigirLogin, exigirAdmin, autorPodeAcessarUnidade } from "../middleware/auth";
import { comErro } from "../middleware/asyncHandler";
import { atualizarLead, apagarLead, buscarUnidadeEfetivaDoLead } from "../repositories/leads.repo";
import { devolverAoBot } from "../repositories/conversationState.repo";
import { fecharAtendimentosDoLead } from "../repositories/relay.repo";
import { inserirNota, listarNotas } from "../repositories/leadNotes.repo";
import { idParamSchema, atualizacaoSchema, notaSchema, mensagemConversaSchema } from "./leadsApi.schemas";
import { listarConversa, buscarLeadParaConversa } from "../repositories/conversa.repo";
import { marcarEmAtendimentoHumano } from "../repositories/conversationState.repo";
import { sendWhatsAppMessage } from "../services/whatsapp.service";

export const leadsApiRouter = Router();

/**
 * Carrega o lead pra checagem de existência + permissão numa só consulta.
 * Responde 404/403 e retorna `null` quando a rota deve parar aqui — o
 * chamador só segue quando o retorno não é `null`.
 */
async function autorizarAcessoAoLead(req: Request, res: Response, leadId: string): Promise<boolean> {
  const lead = await buscarUnidadeEfetivaDoLead(leadId);
  if (!lead) {
    res.status(404).json({ erro: "lead não encontrado" });
    return false;
  }
  if (!autorPodeAcessarUnidade(req.autor!, lead.unidade)) {
    res.status(403).json({ erro: "Sem permissão para este lead." });
    return false;
  }
  return true;
}

/**
 * PATCH /api/leads/:id — atualização manual pelo vendedor/gerente (estágio 6).
 *
 * Cobre exatamente o que faltava pra o lead ser trabalhável: mover de etapa do
 * funil, confirmar a unidade (campo que existia no schema e nunca era escrito)
 * e devolver a conversa ao bot depois do atendimento humano.
 */
leadsApiRouter.patch("/api/leads/:id", comErro(exigirLogin), comErro(async (req: Request, res: Response) => {
  const idResult = idParamSchema.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ erro: idResult.error.issues[0]?.message });
    return;
  }
  const leadId = idResult.data;

  const parsed = atualizacaoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: parsed.error.flatten() });
    return;
  }

  if (!(await autorizarAcessoAoLead(req, res, leadId))) return;

  const { status, unidade_confirmada, devolver_ao_bot, nome_cliente, whatsapp_number } = parsed.data;

  try {
    await atualizarLead(leadId, { status, unidade_confirmada, nome_cliente, whatsapp_number });
  } catch (err) {
    // 23505 = unique_violation em leads.whatsapp_number: já existe outro lead
    // com esse número. Erro do usuário, não do servidor — merece 409 legível.
    if ((err as { code?: string }).code === "23505") {
      res.status(409).json({ erro: "Já existe outro lead com esse número de WhatsApp." });
      return;
    }
    throw err;
  }

  let devolvido = false;
  if (devolver_ao_bot) {
    // Encerra o relay do handover junto: devolver ao bot com o relay aberto
    // deixaria vendedor e bot respondendo o mesmo cliente ao mesmo tempo.
    await fecharAtendimentosDoLead(leadId);
    devolvido = await devolverAoBot(leadId);
    if (!devolvido) {
      // Lead sem linha em conversation_state: nunca passou pelo fluxo de bot,
      // então não havia handoff a reverter. Não é erro.
      logger.info({ leadId }, "devolver ao bot ignorado — lead sem estado de conversa");
    }
  }

  logger.info(
    {
      leadId,
      status,
      unidade_confirmada,
      nome_cliente,
      whatsapp_number,
      devolvidoAoBot: devolvido,
      // Rastro de quem agiu — antes da autenticação não havia como saber.
      usuarioId: req.autor?.usuarioId,
      autor: req.autor?.nome,
    },
    "lead atualizado manualmente"
  );
  res.json({
    ok: true,
    leadId,
    alterado: { status, unidade_confirmada, nome_cliente, whatsapp_number, devolvido_ao_bot: devolvido },
  });
}));

/**
 * DELETE /api/leads/:id — apaga o lead e todo o histórico. Só admin: apagar é
 * irreversível e o uso principal é limpar leads de TESTE pra repetir o fluxo
 * do zero (o número volta a ser cliente novo). Vendedor não apaga lead real
 * por engano porque nem vê o botão — e a API confere de novo aqui.
 */
leadsApiRouter.delete("/api/leads/:id", comErro(exigirLogin), exigirAdmin, comErro(async (req: Request, res: Response) => {
  const idResult = idParamSchema.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ erro: idResult.error.issues[0]?.message });
    return;
  }
  const leadId = idResult.data;

  const apagado = await apagarLead(leadId);
  if (!apagado) {
    res.status(404).json({ erro: "lead não encontrado" });
    return;
  }

  logger.info(
    { leadId, usuarioId: req.autor?.usuarioId, autor: req.autor?.nome },
    "lead apagado pelo painel"
  );
  res.json({ ok: true, leadId, apagado: true });
}));

/** POST /api/leads/:id/notas — registra observação de quem atendeu. */
leadsApiRouter.post("/api/leads/:id/notas", comErro(exigirLogin), comErro(async (req: Request, res: Response) => {
  const idResult = idParamSchema.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ erro: idResult.error.issues[0]?.message });
    return;
  }
  const leadId = idResult.data;

  const parsed = notaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: parsed.error.flatten() });
    return;
  }

  if (!(await autorizarAcessoAoLead(req, res, leadId))) return;

  // Autoria vem da SESSÃO, não do corpo da requisição: se o cliente pudesse
  // escolher o autor, a nota não provaria nada sobre quem a escreveu.
  const autor = req.autor!;
  const nota = await inserirNota(leadId, parsed.data.texto, autor.nome, autor.usuarioId);

  logger.info({ leadId, notaId: nota.id, usuarioId: autor.usuarioId }, "nota adicionada ao lead");
  res.status(201).json(nota);
}));

/** GET /api/leads/:id/notas — histórico de observações do lead. */
leadsApiRouter.get("/api/leads/:id/notas", comErro(exigirLogin), comErro(async (req: Request, res: Response) => {
  const idResult = idParamSchema.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ erro: idResult.error.issues[0]?.message });
    return;
  }
  const leadId = idResult.data;

  if (!(await autorizarAcessoAoLead(req, res, leadId))) return;

  res.json(await listarNotas(leadId));
}));

/**
 * GET /api/leads/:id/conversa — histórico unificado (cliente + empresa) para
 * a tela de chat do painel. Mesma autorização por unidade das outras rotas.
 */
leadsApiRouter.get("/api/leads/:id/conversa", comErro(exigirLogin), comErro(async (req: Request, res: Response) => {
  const idResult = idParamSchema.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ erro: idResult.error.issues[0]?.message });
    return;
  }
  const leadId = idResult.data;

  if (!(await autorizarAcessoAoLead(req, res, leadId))) return;

  const lead = await buscarLeadParaConversa(leadId);
  if (!lead) {
    res.status(404).json({ erro: "lead não encontrado" });
    return;
  }

  res.json({
    lead: {
      id: lead.id,
      nome_cliente: lead.nomeCliente,
      whatsapp_number: lead.whatsappNumber,
      em_atendimento_humano: lead.emAtendimentoHumano,
    },
    mensagens: await listarConversa(lead.whatsappNumber),
  });
}));

/**
 * POST /api/leads/:id/conversa — atendente responde o cliente PELO NÚMERO DO
 * BOT, direto do painel (handover, caminho 2 — o caminho 1 é o relay pelo
 * WhatsApp do vendedor).
 *
 * Enviar daqui marca o lead como em atendimento humano ANTES do envio: sem
 * isso, o bot poderia responder a próxima mensagem do cliente por cima da
 * conversa que o humano acabou de assumir. "Devolver ao bot" (que já existe
 * no painel) desfaz.
 *
 * Erro da Meta propaga como 502 com a mensagem real — o caso típico é a
 * janela de 24h fechada (cliente sumido há mais de um dia), e o atendente
 * precisa saber que a mensagem NÃO chegou.
 */
leadsApiRouter.post("/api/leads/:id/conversa", comErro(exigirLogin), comErro(async (req: Request, res: Response) => {
  const idResult = idParamSchema.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ erro: idResult.error.issues[0]?.message });
    return;
  }
  const leadId = idResult.data;

  const parsed = mensagemConversaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: parsed.error.flatten() });
    return;
  }

  if (!(await autorizarAcessoAoLead(req, res, leadId))) return;

  const lead = await buscarLeadParaConversa(leadId);
  if (!lead) {
    res.status(404).json({ erro: "lead não encontrado" });
    return;
  }

  await marcarEmAtendimentoHumano(leadId);

  try {
    await sendWhatsAppMessage(lead.whatsappNumber, parsed.data.texto, "painel");
  } catch (error) {
    logger.error({ err: error, leadId, usuarioId: req.autor?.usuarioId }, "falha ao enviar mensagem do painel");
    const detalhe = String(error);
    const janelaFechada = detalhe.includes("131047");
    res.status(502).json({
      erro: janelaFechada
        ? "A janela de 24h da Meta está fechada (o cliente não escreve há mais de um dia). Texto livre não entrega — aguarde o cliente responder ou use o contato por outro canal."
        : "Falha ao enviar pelo WhatsApp. Tente novamente.",
    });
    return;
  }

  logger.info({ leadId, usuarioId: req.autor?.usuarioId, autor: req.autor?.nome }, "mensagem enviada pelo chat do painel");
  res.status(201).json({ ok: true });
}));
