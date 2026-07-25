import { pool } from "../db/client";
import { logger } from "../config/logger";
import { extractFromMessage, ExtractedLeadData } from "./anthropic.service";
import { determinarUnidadeRecomendada, UnidadeRecomendada } from "./routing.service";
import { upsertLead } from "../repositories/leads.repo";
import { insertDemandSignal } from "../repositories/demandSignals.repo";
import { upsertConversationState } from "../repositories/conversationState.repo";

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

export type ProcessResult =
  | { status: "ignorado"; motivo: string }
  | {
      status: "processado";
      leadId: string;
      dadosExtraidos: ExtractedLeadData;
      unidadeRecomendada: UnidadeRecomendada | null;
    }
  | { status: "erro"; erro: string };

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
    await pool.query(`UPDATE raw_messages SET processado = true WHERE id = $1`, [rawMessageId]);

    log.info({ leadId, ramo: extracted.ramo, unidadeRecomendada }, "lead e sinal de demanda gravados com sucesso");
    return { status: "processado", leadId, dadosExtraidos: extracted, unidadeRecomendada };
  } catch (error) {
    // Em caso de erro, NÃO marca processado = true (permite reprocessamento manual — seção 6.1.h).
    await pool.query(`UPDATE raw_messages SET erro = $1 WHERE id = $2`, [String(error), rawMessageId]);
    log.error({ err: error }, "falha ao processar mensagem — marcada para reprocessamento manual");
    return { status: "erro", erro: String(error) };
  }
}
