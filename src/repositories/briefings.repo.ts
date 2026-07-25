import { pool } from "../db/client";
import { MonthlyBriefingContent } from "../services/briefing.service";

export interface DemandSignalRow {
  tipo_evento: string | null;
  palavras_chave: string[] | null;
  objecao_ou_duvida: string | null;
  gatilho_emocional: string | null;
}

/** Busca todos os sinais de demanda criados dentro do período [inicio, fim). */
export async function findDemandSignalsBetween(inicio: Date, fim: Date): Promise<DemandSignalRow[]> {
  const result = await pool.query<DemandSignalRow>(
    `SELECT tipo_evento, palavras_chave, objecao_ou_duvida, gatilho_emocional
     FROM demand_signals
     WHERE created_at >= $1 AND created_at < $2`,
    [inicio, fim]
  );
  return result.rows;
}

export async function saveMonthlyBriefing(periodo: string, conteudo: MonthlyBriefingContent): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO monthly_briefings (periodo, conteudo_json, enviado)
     VALUES ($1, $2, false)
     RETURNING id`,
    [periodo, JSON.stringify(conteudo)]
  );
  return result.rows[0].id;
}

export async function markBriefingAsSent(id: string): Promise<void> {
  await pool.query(`UPDATE monthly_briefings SET enviado = true WHERE id = $1`, [id]);
}
