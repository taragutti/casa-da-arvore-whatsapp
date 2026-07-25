import { pool } from "../db/client";
import { ExtractedLeadData } from "../services/anthropic.service";
import { UnidadeRecomendada } from "../services/routing.service";

/**
 * Upsert por whatsapp_number (seção 6.1.d da especificação):
 * cria o lead se não existir; se existir, atualiza apenas campos não nulos
 * e a última interação.
 *
 * unidade_recomendada vem do roteamento por ramo (Seção 3 do fluxo detalhado)
 * calculado em cima dos dados desta mensagem — usa COALESCE como os demais
 * campos para não apagar uma recomendação já feita quando uma mensagem
 * posterior não tiver dado suficiente para decidir de novo.
 */
export async function upsertLead(
  whatsappNumber: string,
  data: ExtractedLeadData,
  unidadeRecomendada: UnidadeRecomendada | null
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO leads (
       whatsapp_number, nome_cliente, tipo_evento, data_evento,
       numero_convidados, orcamento_mencionado, resumo_pedido, unidade_recomendada, ultima_interacao
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (whatsapp_number) DO UPDATE SET
       nome_cliente = COALESCE(EXCLUDED.nome_cliente, leads.nome_cliente),
       tipo_evento = COALESCE(EXCLUDED.tipo_evento, leads.tipo_evento),
       data_evento = COALESCE(EXCLUDED.data_evento, leads.data_evento),
       numero_convidados = COALESCE(EXCLUDED.numero_convidados, leads.numero_convidados),
       orcamento_mencionado = COALESCE(EXCLUDED.orcamento_mencionado, leads.orcamento_mencionado),
       resumo_pedido = COALESCE(EXCLUDED.resumo_pedido, leads.resumo_pedido),
       unidade_recomendada = COALESCE(EXCLUDED.unidade_recomendada, leads.unidade_recomendada),
       ultima_interacao = now()
     RETURNING id`,
    [
      whatsappNumber,
      data.nome_cliente,
      data.tipo_evento,
      data.data_evento,
      data.numero_convidados,
      data.orcamento_mencionado,
      data.resumo_pedido || null,
      unidadeRecomendada,
    ]
  );

  return result.rows[0].id;
}

/** Adiciona uma tag ao lead sem duplicar (ex.: "precisa_qualificacao_humana", Seção 5). */
export async function adicionarTag(leadId: string, tag: string): Promise<void> {
  await pool.query(
    `UPDATE leads
     SET tags = CASE
       WHEN $2 = ANY(COALESCE(tags, ARRAY[]::text[])) THEN tags
       ELSE array_append(COALESCE(tags, ARRAY[]::text[]), $2)
     END
     WHERE id = $1`,
    [leadId, tag]
  );
}
