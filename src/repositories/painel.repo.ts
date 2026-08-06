import { pool } from "../db/client";
import { LeadNote, listarNotasPorLeads } from "./leadNotes.repo";
import { UnidadeRecomendada } from "../services/routing.service";

export interface LeadPainel {
  id: string;
  whatsapp_number: string;
  nome_cliente: string | null;
  email: string | null;
  tipo_evento: string | null;
  data_evento: string | null;
  numero_convidados: number | null;
  orcamento_mencionado: number | null;
  origem_lead: string | null;
  resumo_pedido: string | null;
  status: string;
  unidade_recomendada: string | null;
  tags: string[] | null;
  created_at: string;
  ultima_interacao: string;
  ramo: string | null;
  etapa_atual: string | null;
  dados_coletados: Record<string, unknown> | null;
  em_atendimento_humano: boolean | null;
  unidade_confirmada: string | null;
  notas: LeadNote[];
}

/**
 * Leads + estado de conversa + notas para o painel (Seção 7).
 * Limitado aos 200 mais recentemente ativos — "mínimo" de propósito, sem
 * paginação/filtros; se o volume crescer além disso, vale revisitar.
 *
 * As notas vêm numa segunda query em lote (não por lead) para não fazer 200
 * consultas ao montar a página.
 *
 * `unidadesPermitidas` implementa a visibilidade por unidade do estágio 3:
 * omitido (admin) não filtra nada; array (atendente) restringe aos leads cuja
 * unidade efetiva (confirmada, senão recomendada) está na lista — e SEMPRE
 * inclui leads sem unidade decidida ainda, pra nenhum lead ficar sem ninguém
 * vendo ele só porque a qualificação não chegou lá.
 */
export async function buscarLeadsParaPainel(unidadesPermitidas?: UnidadeRecomendada[]): Promise<LeadPainel[]> {
  const result = await pool.query<Omit<LeadPainel, "notas">>(
    `SELECT
       l.id, l.whatsapp_number, l.nome_cliente, l.email, l.tipo_evento, l.data_evento,
       l.numero_convidados, l.orcamento_mencionado, l.origem_lead, l.resumo_pedido, l.status,
       l.unidade_recomendada, l.unidade_confirmada, l.tags, l.created_at, l.ultima_interacao,
       cs.ramo, cs.etapa_atual, cs.dados_coletados, cs.em_atendimento_humano
     FROM leads l
     LEFT JOIN conversation_state cs ON cs.lead_id = l.id
     WHERE $1::unidade_enum[] IS NULL
        OR COALESCE(l.unidade_confirmada, l.unidade_recomendada) = ANY($1)
        OR COALESCE(l.unidade_confirmada, l.unidade_recomendada) IS NULL
     ORDER BY l.ultima_interacao DESC
     LIMIT 200`,
    [unidadesPermitidas ?? null]
  );

  const notasPorLead = await listarNotasPorLeads(result.rows.map((l) => l.id));
  return result.rows.map((lead) => ({ ...lead, notas: notasPorLead.get(lead.id) ?? [] }));
}
