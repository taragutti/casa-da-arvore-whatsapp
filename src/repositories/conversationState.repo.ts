import { pool } from "../db/client";
import { DadosPorRamo, RamoEvento } from "../services/anthropic.service";

/** Remove campos null/[] antes do merge — uma mensagem sem dado novo não pode apagar dado já coletado. */
function apenasPreenchidos(dados: DadosPorRamo): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(dados).filter(([, valor]) => valor !== null && !(Array.isArray(valor) && valor.length === 0))
  );
}

/**
 * Upsert por lead_id (Seção 2.2 do fluxo detalhado): ramo e dados_coletados
 * evoluem por merge raso a cada mensagem, sem apagar o que já foi coletado
 * em mensagens anteriores quando a mensagem atual não traz aquele campo.
 */
export async function upsertConversationState(
  leadId: string,
  ramo: RamoEvento | null,
  dadosRamo: DadosPorRamo
): Promise<void> {
  const dadosPreenchidos = apenasPreenchidos(dadosRamo);

  await pool.query(
    `INSERT INTO conversation_state (lead_id, ramo, dados_coletados, updated_at)
     VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (lead_id) DO UPDATE SET
       ramo = COALESCE(EXCLUDED.ramo, conversation_state.ramo),
       dados_coletados = conversation_state.dados_coletados || EXCLUDED.dados_coletados,
       updated_at = now()`,
    [leadId, ramo, JSON.stringify(dadosPreenchidos)]
  );
}

/** Etapa atual da régua de mídia progressiva (1 a 4), ou null se ainda não começou (Seção 4). */
export async function getEtapaMidiaAtual(leadId: string): Promise<number | null> {
  const result = await pool.query<{ aguardando_engajamento_etapa_midia: number | null }>(
    `SELECT aguardando_engajamento_etapa_midia FROM conversation_state WHERE lead_id = $1`,
    [leadId]
  );
  return result.rows[0]?.aguardando_engajamento_etapa_midia ?? null;
}

/** Registra que a mídia da etapa foi enviada — pressupõe que upsertConversationState já rodou antes para este lead. */
export async function registrarEnvioMidia(leadId: string, etapa: number): Promise<void> {
  await pool.query(
    `UPDATE conversation_state
     SET aguardando_engajamento_etapa_midia = $2, ultimo_envio_midia_em = now(), updated_at = now()
     WHERE lead_id = $1`,
    [leadId, etapa]
  );
}

export interface EstadoHandoff {
  emAtendimentoHumano: boolean;
  tentativasSemClassificacao: number;
}

/** Estado de handoff ANTES da mensagem atual — usado pra decidir se um novo gatilho dispara ou se o lead já está em atendimento humano (Seção 5). */
export async function getEstadoHandoff(leadId: string): Promise<EstadoHandoff> {
  const result = await pool.query<{ em_atendimento_humano: boolean; tentativas_sem_classificacao: number }>(
    `SELECT em_atendimento_humano, tentativas_sem_classificacao FROM conversation_state WHERE lead_id = $1`,
    [leadId]
  );
  const row = result.rows[0];
  return {
    emAtendimentoHumano: row?.em_atendimento_humano ?? false,
    tentativasSemClassificacao: row?.tentativas_sem_classificacao ?? 0,
  };
}

export async function atualizarTentativasSemClassificacao(leadId: string, valor: number): Promise<void> {
  await pool.query(
    `UPDATE conversation_state SET tentativas_sem_classificacao = $2, updated_at = now() WHERE lead_id = $1`,
    [leadId, valor]
  );
}

/** Marca a conversa como em atendimento humano — o bot para de responder automaticamente até isso ser revertido manualmente (Seção 5). */
export async function marcarEmAtendimentoHumano(leadId: string): Promise<void> {
  await pool.query(
    `UPDATE conversation_state SET em_atendimento_humano = true, updated_at = now() WHERE lead_id = $1`,
    [leadId]
  );
}
