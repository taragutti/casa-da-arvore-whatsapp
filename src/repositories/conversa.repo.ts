import { pool } from "../db/client";
import { logger } from "../config/logger";

export type OrigemEnvio = "bot" | "vendedor" | "painel";
export type CanalEnvio = "texto" | "template" | "midia";

/** Mesma forma canônica de raw_messages: "+" seguido só de dígitos. */
function numeroCanonico(numero: string): string {
  return `+${numero.replace(/\D/g, "")}`;
}

/**
 * Registra uma mensagem que a empresa enviou. Não-fatal DE PROPÓSITO: é
 * chamada logo após um envio que a Meta já aceitou — deixar o registro
 * derrubar o fluxo transformaria um problema de auditoria em mensagem
 * perdida de verdade.
 */
export async function registrarMensagemEnviada(params: {
  whatsappNumber: string;
  texto: string;
  canal: CanalEnvio;
  origem: OrigemEnvio;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO mensagens_enviadas (whatsapp_number, texto, canal, origem)
       VALUES ($1, $2, $3, $4)`,
      [numeroCanonico(params.whatsappNumber), params.texto, params.canal, params.origem]
    );
  } catch (error) {
    logger.error({ err: error, canal: params.canal }, "falha ao registrar mensagem enviada (envio já feito)");
  }
}

export interface MensagemConversa {
  direcao: "cliente" | "empresa";
  /** null quando direcao = 'cliente'. */
  origem: OrigemEnvio | null;
  texto: string;
  criadaEm: string;
}

/**
 * Histórico unificado da conversa de um número: o que o cliente escreveu
 * (raw_messages) + o que a empresa mandou (mensagens_enviadas), em ordem
 * cronológica. Limitado às últimas `limite` mensagens — a tela de conversa
 * não precisa carregar meses de histórico pra atender o lead de hoje.
 */
export async function listarConversa(whatsappNumber: string, limite = 200): Promise<MensagemConversa[]> {
  const numero = numeroCanonico(whatsappNumber);

  const result = await pool.query<{
    direcao: "cliente" | "empresa";
    origem: OrigemEnvio | null;
    texto: string;
    criada_em: string;
  }>(
    `SELECT * FROM (
       SELECT 'cliente'::text AS direcao, NULL::text AS origem,
              mensagem_original AS texto, received_at AS criada_em
       FROM raw_messages WHERE whatsapp_number = $1
       UNION ALL
       SELECT 'empresa'::text AS direcao, origem,
              texto, created_at AS criada_em
       FROM mensagens_enviadas WHERE whatsapp_number = $1
       ORDER BY criada_em DESC
       LIMIT $2
     ) ultimas
     ORDER BY criada_em ASC`,
    [numero, limite]
  );

  return result.rows.map((row) => ({
    direcao: row.direcao,
    origem: row.origem as OrigemEnvio | null,
    texto: row.texto,
    criadaEm: row.criada_em,
  }));
}

export interface LeadParaConversa {
  id: string;
  whatsappNumber: string;
  nomeCliente: string | null;
  emAtendimentoHumano: boolean;
}

/** Dados mínimos que a tela/API de conversa precisa do lead, numa consulta só. */
export async function buscarLeadParaConversa(leadId: string): Promise<LeadParaConversa | null> {
  const result = await pool.query<{
    id: string;
    whatsapp_number: string;
    nome_cliente: string | null;
    em_atendimento_humano: boolean | null;
  }>(
    `SELECT l.id, l.whatsapp_number, l.nome_cliente, cs.em_atendimento_humano
     FROM leads l
     LEFT JOIN conversation_state cs ON cs.lead_id = l.id
     WHERE l.id = $1`,
    [leadId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    whatsappNumber: row.whatsapp_number,
    nomeCliente: row.nome_cliente,
    emAtendimentoHumano: row.em_atendimento_humano ?? false,
  };
}
