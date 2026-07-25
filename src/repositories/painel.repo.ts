import { pool } from "../db/client";

export interface LeadPainel {
  id: string;
  whatsapp_number: string;
  nome_cliente: string | null;
  tipo_evento: string | null;
  data_evento: string | null;
  numero_convidados: number | null;
  orcamento_mencionado: number | null;
  origem_lead: string | null;
  status: string;
  unidade_recomendada: string | null;
  tags: string[] | null;
  created_at: string;
  ultima_interacao: string;
  ramo: string | null;
  etapa_atual: string | null;
  dados_coletados: Record<string, unknown> | null;
  em_atendimento_humano: boolean | null;
}

/**
 * Leads + estado de conversa para o painel de visibilidade (Seção 7).
 * Limitado aos 200 mais recentemente ativos — "mínimo" de propósito, sem
 * paginação/filtros; se o volume crescer além disso, vale revisitar.
 */
export async function buscarLeadsParaPainel(): Promise<LeadPainel[]> {
  const result = await pool.query<LeadPainel>(
    `SELECT
       l.id, l.whatsapp_number, l.nome_cliente, l.tipo_evento, l.data_evento,
       l.numero_convidados, l.orcamento_mencionado, l.origem_lead, l.status,
       l.unidade_recomendada, l.tags, l.created_at, l.ultima_interacao,
       cs.ramo, cs.etapa_atual, cs.dados_coletados, cs.em_atendimento_humano
     FROM leads l
     LEFT JOIN conversation_state cs ON cs.lead_id = l.id
     ORDER BY l.ultima_interacao DESC
     LIMIT 200`
  );
  return result.rows;
}
