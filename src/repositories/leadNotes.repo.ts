import { pool } from "../db/client";

export interface LeadNote {
  id: string;
  created_at: string;
  autor: string | null;
  texto: string;
}

export async function inserirNota(leadId: string, texto: string, autor: string | null): Promise<LeadNote> {
  const result = await pool.query<LeadNote>(
    `INSERT INTO lead_notes (lead_id, texto, autor)
     VALUES ($1, $2, $3)
     RETURNING id, created_at, autor, texto`,
    [leadId, texto, autor]
  );
  return result.rows[0];
}

export async function listarNotas(leadId: string, limite = 50): Promise<LeadNote[]> {
  const result = await pool.query<LeadNote>(
    `SELECT id, created_at, autor, texto
     FROM lead_notes
     WHERE lead_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [leadId, limite]
  );
  return result.rows;
}

/** Notas dos leads listados, agrupadas por lead — evita N+1 ao montar o painel. */
export async function listarNotasPorLeads(leadIds: string[]): Promise<Map<string, LeadNote[]>> {
  const porLead = new Map<string, LeadNote[]>();
  if (leadIds.length === 0) return porLead;

  const result = await pool.query<LeadNote & { lead_id: string }>(
    `SELECT lead_id, id, created_at, autor, texto
     FROM lead_notes
     WHERE lead_id = ANY($1::uuid[])
     ORDER BY created_at DESC`,
    [leadIds]
  );

  for (const row of result.rows) {
    const lista = porLead.get(row.lead_id) ?? [];
    lista.push({ id: row.id, created_at: row.created_at, autor: row.autor, texto: row.texto });
    porLead.set(row.lead_id, lista);
  }
  return porLead;
}
