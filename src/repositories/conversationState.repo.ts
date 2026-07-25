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
