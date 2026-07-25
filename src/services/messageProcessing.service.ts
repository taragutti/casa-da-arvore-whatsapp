import type { Logger } from "pino";
import { pool } from "../db/client";
import { logger } from "../config/logger";
import { extractFromMessage, ExtractedLeadData } from "./anthropic.service";
import { determinarUnidadeRecomendada, UnidadeRecomendada } from "./routing.service";
import { detectarGatilhoHandoff, calcularSlaMinutos, dentroDoHorarioComercial, GatilhoHandoff } from "./handoff.service";
import { sendHandoffNotificationEmail, sendHandoffFollowUpEmail } from "./email.service";
import { upsertLead, adicionarTag } from "../repositories/leads.repo";
import { insertDemandSignal } from "../repositories/demandSignals.repo";
import {
  upsertConversationState,
  getEstadoHandoff,
  atualizarTentativasSemClassificacao,
  marcarEmAtendimentoHumano,
} from "../repositories/conversationState.repo";

const PALAVRAS_RELEVANTES = [
  "orçamento",
  "orcamento",
  "festa",
  "evento",
  "preço",
  "preco",
  "casamento",
  "aniversário",
  "aniversario",
  "15 anos",
  "debutante",
  "chá de bebê",
  "cha de bebe",
];

export function isMensagemRelevante(mensagem: string): boolean {
  const texto = mensagem.toLowerCase();
  return PALAVRAS_RELEVANTES.some((termo) => texto.includes(termo));
}

export interface ResultadoHandoff {
  emAtendimentoHumano: boolean;
  /** Só preenchido quando ESTA mensagem disparou um handoff novo (não quando o lead já estava em atendimento humano). */
  gatilhoNovo: GatilhoHandoff | null;
}

export type ProcessResult =
  | { status: "ignorado"; motivo: string }
  | {
      status: "processado";
      leadId: string;
      dadosExtraidos: ExtractedLeadData;
      unidadeRecomendada: UnidadeRecomendada | null;
      handoff: ResultadoHandoff;
    }
  | { status: "erro"; erro: string };

/**
 * Decide e aplica o handoff (Seção 5): se o lead já estava em atendimento
 * humano, só avisa que chegou mensagem nova (sem reiniciar o fluxo). Senão,
 * checa os gatilhos imediatos e, se algum disparar, marca a conversa e
 * notifica por e-mail. Falha no envio de e-mail é logada mas não impede a
 * marcação do estado — melhor o bot ficar quieto do que responder por cima
 * de um handoff que não foi notificado.
 */
async function processarHandoff(
  whatsappNumber: string,
  leadId: string,
  mensagem: string,
  extracted: ExtractedLeadData,
  unidadeRecomendada: UnidadeRecomendada | null,
  log: Logger
): Promise<ResultadoHandoff> {
  const estadoAnterior = await getEstadoHandoff(leadId);
  const semClassificacaoAgora = extracted.ramo == null && extracted.tipo_evento == null;
  const novasTentativas = semClassificacaoAgora ? estadoAnterior.tentativasSemClassificacao + 1 : 0;

  if (estadoAnterior.emAtendimentoHumano) {
    await atualizarTentativasSemClassificacao(leadId, novasTentativas);
    try {
      await sendHandoffFollowUpEmail({ whatsappNumber, nomeCliente: extracted.nome_cliente, mensagemOriginal: mensagem });
    } catch (error) {
      log.error({ err: error }, "falha ao notificar novo contato de lead em atendimento humano");
    }
    return { emAtendimentoHumano: true, gatilhoNovo: null };
  }

  const decisao = detectarGatilhoHandoff(mensagem, extracted.sinal_engajamento, novasTentativas);
  await atualizarTentativasSemClassificacao(leadId, decisao ? 0 : novasTentativas);

  if (!decisao) {
    return { emAtendimentoHumano: false, gatilhoNovo: null };
  }

  await marcarEmAtendimentoHumano(leadId);
  if (decisao.gatilho === "falha_classificacao_repetida") {
    await adicionarTag(leadId, "precisa_qualificacao_humana");
  }

  try {
    await sendHandoffNotificationEmail({
      whatsappNumber,
      nomeCliente: extracted.nome_cliente,
      ramo: extracted.ramo,
      unidadeRecomendada,
      gatilho: decisao.gatilho,
      paraGerente: decisao.paraGerente,
      slaMinutos: calcularSlaMinutos(unidadeRecomendada, extracted.ramo),
      dentroDoHorarioComercial: dentroDoHorarioComercial(),
      resumoPedido: extracted.resumo_pedido,
      mensagemOriginal: mensagem,
    });
  } catch (error) {
    log.error({ err: error, gatilho: decisao.gatilho }, "falha ao notificar handoff por e-mail");
  }

  log.info({ gatilho: decisao.gatilho, paraGerente: decisao.paraGerente }, "handoff disparado");
  return { emAtendimentoHumano: true, gatilhoNovo: decisao.gatilho };
}

/**
 * Núcleo do pipeline (seção 6.1 da especificação): salva o payload bruto,
 * filtra relevância, extrai via IA, e grava lead + sinal de demanda.
 * Usado tanto pelo endpoint de ingestão genérico quanto pelo webhook do
 * WhatsApp Cloud API — cada um decide separadamente se/como responder ao
 * cliente depois de chamar esta função.
 *
 * Cada chamada gera um `rawMessageId`, que vira o fio condutor dos logs
 * (Etapa 8): dá pra filtrar todos os eventos de UMA mensagem específica com
 * `grep <rawMessageId>` no log, do recebimento até o resultado final.
 */
export async function processIncomingMessage(
  whatsappNumber: string,
  mensagem: string,
  payloadBruto: unknown
): Promise<ProcessResult> {
  const rawResult = await pool.query<{ id: string }>(
    `INSERT INTO raw_messages (whatsapp_number, mensagem_original, payload_bruto, processado)
     VALUES ($1, $2, $3, false) RETURNING id`,
    [whatsappNumber, mensagem, JSON.stringify(payloadBruto)]
  );
  const rawMessageId = rawResult.rows[0].id;
  const log = logger.child({ rawMessageId, whatsappNumber });

  log.info("mensagem recebida e gravada em raw_messages");

  if (!isMensagemRelevante(mensagem)) {
    await pool.query(`UPDATE raw_messages SET processado = true WHERE id = $1`, [rawMessageId]);
    log.info("mensagem ignorada — sem termos relevantes");
    return { status: "ignorado", motivo: "mensagem sem termos relevantes" };
  }

  log.debug("mensagem relevante — iniciando extração via IA");

  try {
    const extracted = await extractFromMessage(mensagem);
    log.debug({ tipo_evento: extracted.tipo_evento, ramo: extracted.ramo }, "extração concluída");

    const unidadeRecomendada = determinarUnidadeRecomendada(
      extracted.ramo,
      extracted.dados_ramo,
      extracted.numero_convidados,
      extracted.orcamento_mencionado
    );

    const leadId = await upsertLead(whatsappNumber, extracted, unidadeRecomendada);
    await insertDemandSignal(leadId, mensagem, extracted);
    await upsertConversationState(leadId, extracted.ramo, extracted.dados_ramo);

    const handoff = await processarHandoff(whatsappNumber, leadId, mensagem, extracted, unidadeRecomendada, log);

    await pool.query(`UPDATE raw_messages SET processado = true WHERE id = $1`, [rawMessageId]);

    log.info(
      { leadId, ramo: extracted.ramo, unidadeRecomendada, emAtendimentoHumano: handoff.emAtendimentoHumano },
      "lead e sinal de demanda gravados com sucesso"
    );
    return { status: "processado", leadId, dadosExtraidos: extracted, unidadeRecomendada, handoff };
  } catch (error) {
    // Em caso de erro, NÃO marca processado = true (permite reprocessamento manual — seção 6.1.h).
    await pool.query(`UPDATE raw_messages SET erro = $1 WHERE id = $2`, [String(error), rawMessageId]);
    log.error({ err: error }, "falha ao processar mensagem — marcada para reprocessamento manual");
    return { status: "erro", erro: String(error) };
  }
}
