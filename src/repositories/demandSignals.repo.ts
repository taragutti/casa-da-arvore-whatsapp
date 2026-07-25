import { pool } from "../db/client";
import { ExtractedLeadData } from "../services/anthropic.service";

export async function insertDemandSignal(
  leadId: string,
  mensagemOriginal: string,
  data: ExtractedLeadData
): Promise<void> {
  await pool.query(
    `INSERT INTO demand_signals (
       lead_id, tipo_evento, palavras_chave, objecao_ou_duvida, gatilho_emocional, mensagem_original
     )
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      leadId,
      data.tipo_evento,
      data.palavras_chave,
      data.objecao_ou_duvida,
      data.gatilho_emocional,
      mensagemOriginal,
    ]
  );
}
