import { Router, Request, Response } from "express";
import { logger } from "../config/logger";
import { autenticarPainel } from "../middleware/painelAuth";
import { atualizarLead, leadExiste } from "../repositories/leads.repo";
import { devolverAoBot } from "../repositories/conversationState.repo";
import { inserirNota, listarNotas } from "../repositories/leadNotes.repo";
import { idParamSchema, atualizacaoSchema, notaSchema } from "./leadsApi.schemas";

export const leadsApiRouter = Router();

/**
 * PATCH /api/leads/:id — atualização manual pelo vendedor/gerente (estágio 6).
 *
 * Cobre exatamente o que faltava pra o lead ser trabalhável: mover de etapa do
 * funil, confirmar a unidade (campo que existia no schema e nunca era escrito)
 * e devolver a conversa ao bot depois do atendimento humano.
 */
leadsApiRouter.patch("/api/leads/:id", autenticarPainel, async (req: Request, res: Response) => {
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

  if (!(await leadExiste(leadId))) {
    res.status(404).json({ erro: "lead não encontrado" });
    return;
  }

  const { status, unidade_confirmada, devolver_ao_bot } = parsed.data;

  await atualizarLead(leadId, { status, unidade_confirmada });

  let devolvido = false;
  if (devolver_ao_bot) {
    devolvido = await devolverAoBot(leadId);
    if (!devolvido) {
      // Lead sem linha em conversation_state: nunca passou pelo fluxo de bot,
      // então não havia handoff a reverter. Não é erro.
      logger.info({ leadId }, "devolver ao bot ignorado — lead sem estado de conversa");
    }
  }

  logger.info({ leadId, status, unidade_confirmada, devolvidoAoBot: devolvido }, "lead atualizado manualmente");
  res.json({ ok: true, leadId, alterado: { status, unidade_confirmada, devolvido_ao_bot: devolvido } });
});

/** POST /api/leads/:id/notas — registra observação de quem atendeu. */
leadsApiRouter.post("/api/leads/:id/notas", autenticarPainel, async (req: Request, res: Response) => {
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

  if (!(await leadExiste(leadId))) {
    res.status(404).json({ erro: "lead não encontrado" });
    return;
  }

  const nota = await inserirNota(leadId, parsed.data.texto, parsed.data.autor ?? null);
  logger.info({ leadId, notaId: nota.id }, "nota adicionada ao lead");
  res.status(201).json(nota);
});

/** GET /api/leads/:id/notas — histórico de observações do lead. */
leadsApiRouter.get("/api/leads/:id/notas", autenticarPainel, async (req: Request, res: Response) => {
  const idResult = idParamSchema.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ erro: idResult.error.issues[0]?.message });
    return;
  }

  res.json(await listarNotas(idResult.data));
});
