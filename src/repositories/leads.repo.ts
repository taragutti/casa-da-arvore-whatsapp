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
       whatsapp_number, nome_cliente, email, tipo_evento, data_evento,
       numero_convidados, orcamento_mencionado, resumo_pedido, unidade_recomendada, ultima_interacao
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (whatsapp_number) DO UPDATE SET
       nome_cliente = COALESCE(EXCLUDED.nome_cliente, leads.nome_cliente),
       email = COALESCE(EXCLUDED.email, leads.email),
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
      data.email,
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

/** Usado pela régua de silêncio (Seção 6) pra detectar se o lead respondeu depois de uma régua ser agendada. */
export async function getUltimaInteracao(leadId: string): Promise<Date | null> {
  const result = await pool.query<{ ultima_interacao: Date }>(`SELECT ultima_interacao FROM leads WHERE id = $1`, [
    leadId,
  ]);
  return result.rows[0]?.ultima_interacao ?? null;
}

export interface LeadParaCicloDeVida {
  id: string;
  whatsapp_number: string;
  nome_cliente: string | null;
}

/**
 * Leads de casamento cujo 1º aniversário (data_evento + 1 ano) caiu nos
 * últimos 3 dias e ainda não foram notificados — a janela de 3 dias é uma
 * margem de segurança caso o job diário não rode exatamente no dia certo
 * (Seção 6, régua de ciclo de vida).
 */
export async function buscarAniversariosCasamento(): Promise<LeadParaCicloDeVida[]> {
  const result = await pool.query<LeadParaCicloDeVida>(
    `SELECT id, whatsapp_number, nome_cliente
     FROM leads
     WHERE tipo_evento = 'casamento'
       AND data_evento IS NOT NULL
       AND (data_evento + INTERVAL '1 year')::date BETWEEN CURRENT_DATE - INTERVAL '3 days' AND CURRENT_DATE
       AND NOT ('aniversario_casamento_enviado' = ANY(COALESCE(tags, ARRAY[]::text[])))`
  );
  return result.rows;
}

/** Leads corporativos 1 ano após o evento, mesma lógica de janela/idempotência do aniversário de casamento. */
export async function buscarProspeccaoCorporativa(): Promise<LeadParaCicloDeVida[]> {
  const result = await pool.query<LeadParaCicloDeVida>(
    `SELECT id, whatsapp_number, nome_cliente
     FROM leads
     WHERE tipo_evento = 'corporativo'
       AND data_evento IS NOT NULL
       AND (data_evento + INTERVAL '1 year')::date BETWEEN CURRENT_DATE - INTERVAL '3 days' AND CURRENT_DATE
       AND NOT ('prospeccao_corporativa_enviada' = ANY(COALESCE(tags, ARRAY[]::text[])))`
  );
  return result.rows;
}

/**
 * Aniversário da criança daqui a 7 dias (Seção 6 do Fluxo Detalhado; Parte
 * 10.5 do Script: "mensagem de felicitação 1 semana antes").
 *
 * A data vem de `dados_coletados->data_aniversario_crianca`, preenchida no
 * ramo de recreação avulsa — a Seção 3.5 chama esse campo de "crítico" porque
 * é justamente o gatilho de cross-sell para festa fechada.
 *
 * Comparar dia e mês, em vez de montar a data do ano corrente, evita o erro de
 * 29 de fevereiro em ano não bissexto. A janela é exata (7 dias): se o job
 * falhar num dia, aquele aniversário passa — preferível a mandar parabéns com
 * três dias de atraso, que soa pior do que não mandar.
 */
export async function buscarAniversariosDeCrianca(): Promise<LeadParaCicloDeVida[]> {
  const result = await pool.query<LeadParaCicloDeVida>(
    `SELECT l.id, l.whatsapp_number, l.nome_cliente
     FROM leads l
     JOIN conversation_state cs ON cs.lead_id = l.id
     WHERE l.status NOT IN ('fechado', 'perdido')
       AND cs.dados_coletados->>'data_aniversario_crianca' IS NOT NULL
       AND EXTRACT(MONTH FROM (cs.dados_coletados->>'data_aniversario_crianca')::date)
           = EXTRACT(MONTH FROM CURRENT_DATE + 7)
       AND EXTRACT(DAY FROM (cs.dados_coletados->>'data_aniversario_crianca')::date)
           = EXTRACT(DAY FROM CURRENT_DATE + 7)
       AND NOT (
         ('aniversario_crianca_' || EXTRACT(YEAR FROM CURRENT_DATE)::int)
         = ANY(COALESCE(l.tags, ARRAY[]::text[]))
       )`
  );
  return result.rows;
}

/**
 * Criança completando 14 anos — convite para conhecer o Casarão para os 15
 * (Seção 6; Parte 10.5 do Script).
 *
 * Janela de 3 dias e tag de uma vez só, como nas demais réguas anuais: este
 * gatilho não se repete, acontece uma vez na vida do lead.
 */
export async function buscarCriancasFazendo14Anos(): Promise<LeadParaCicloDeVida[]> {
  const result = await pool.query<LeadParaCicloDeVida>(
    `SELECT l.id, l.whatsapp_number, l.nome_cliente
     FROM leads l
     JOIN conversation_state cs ON cs.lead_id = l.id
     WHERE l.status NOT IN ('fechado', 'perdido')
       AND cs.dados_coletados->>'data_aniversario_crianca' IS NOT NULL
       AND ((cs.dados_coletados->>'data_aniversario_crianca')::date + INTERVAL '14 years')::date
           BETWEEN CURRENT_DATE - INTERVAL '3 days' AND CURRENT_DATE
       AND NOT ('convite_15_anos_enviado' = ANY(COALESCE(l.tags, ARRAY[]::text[])))`
  );
  return result.rows;
}

/** Leads sem interação há 12 meses, ainda não arquivados — candidatos à última campanha antes do arquivamento (Seção 6). */
export async function buscarLeadsFriosParaArquivar(): Promise<LeadParaCicloDeVida[]> {
  const result = await pool.query<LeadParaCicloDeVida>(
    `SELECT id, whatsapp_number, nome_cliente
     FROM leads
     WHERE status NOT IN ('fechado', 'perdido')
       AND ultima_interacao <= now() - INTERVAL '12 months'
       AND ultima_interacao > now() - INTERVAL '12 months 1 day'`
  );
  return result.rows;
}

/** Arquiva o lead (status 'perdido') após a última campanha de reengajamento (Seção 6). */
export async function arquivarLeadFrio(leadId: string): Promise<void> {
  await pool.query(`UPDATE leads SET status = 'perdido' WHERE id = $1`, [leadId]);
}

export const STATUS_LEAD = [
  "novo",
  "qualificando",
  "proposta_enviada",
  "negociacao",
  "fechado",
  "perdido",
] as const;
export type StatusLead = (typeof STATUS_LEAD)[number];

export interface AtualizacaoLead {
  status?: StatusLead;
  unidade_confirmada?: UnidadeRecomendada;
  /** Correção manual pelo painel (estágio 7) — nome digitado errado pela IA ou pelo cliente. */
  nome_cliente?: string;
  /** Sempre dígitos-only (mesma normalização do webhook); a rota valida/normaliza antes. */
  whatsapp_number?: string;
}

/**
 * Atualização manual feita por quem atende (vendedor/gerente) via API/painel.
 *
 * Só mexe nos campos presentes em `dados` — diferente do upsertLead(), que é
 * alimentado pela IA. Aqui a intenção é humana e explícita: se o vendedor
 * escolheu um valor, ele vence, sem COALESCE.
 *
 * Não toca em `ultima_interacao` de propósito: aquele campo mede contato do
 * CLIENTE e é o que a régua de follow-up usa pra saber se o lead respondeu
 * (Seção 6). Atualizar ali por ação interna cancelaria follow-ups por engano.
 *
 * Retorna false se o lead não existe, pra a rota poder responder 404.
 */
export async function atualizarLead(leadId: string, dados: AtualizacaoLead): Promise<boolean> {
  const campos: string[] = [];
  const valores: unknown[] = [leadId];

  if (dados.status !== undefined) {
    campos.push(`status = $${valores.length + 1}`);
    valores.push(dados.status);
  }
  if (dados.unidade_confirmada !== undefined) {
    campos.push(`unidade_confirmada = $${valores.length + 1}`);
    valores.push(dados.unidade_confirmada);
  }
  if (dados.nome_cliente !== undefined) {
    campos.push(`nome_cliente = $${valores.length + 1}`);
    valores.push(dados.nome_cliente);
  }
  if (dados.whatsapp_number !== undefined) {
    campos.push(`whatsapp_number = $${valores.length + 1}`);
    valores.push(dados.whatsapp_number);
  }

  if (campos.length === 0) return true; // nada a alterar não é erro

  const result = await pool.query(`UPDATE leads SET ${campos.join(", ")} WHERE id = $1`, valores);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Apaga o lead e TODO o histórico dele — usado pelo painel (admin) sobretudo
 * pra repetir testes de ponta a ponta: apagado, o número volta a ser tratado
 * como cliente novo na próxima mensagem.
 *
 * As tabelas com FK pra leads(id) (conversation_state, lead_notes,
 * demand_signals, relay_atendimentos, relay_mensagens) caem pelo ON DELETE
 * CASCADE do schema. As quatro chaveadas por NÚMERO (raw_messages,
 * saudacoes_enviadas, script_state, mensagens_enviadas) precisam de DELETE
 * explícito — sem isso a saudação não seria reenviada e o script continuaria
 * do meio, e o "cliente novo" do teste não seria novo de verdade.
 *
 * Retorna false se o lead não existe (rota responde 404).
 */
export async function apagarLead(leadId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lead = await client.query<{ whatsapp_number: string }>(
      `SELECT whatsapp_number FROM leads WHERE id = $1 FOR UPDATE`,
      [leadId]
    );
    if (lead.rowCount === 0) {
      await client.query("ROLLBACK");
      return false;
    }
    const numero = lead.rows[0].whatsapp_number;
    await client.query(`DELETE FROM raw_messages WHERE whatsapp_number = $1`, [numero]);
    await client.query(`DELETE FROM saudacoes_enviadas WHERE whatsapp_number = $1`, [numero]);
    await client.query(`DELETE FROM script_state WHERE whatsapp_number = $1`, [numero]);
    await client.query(`DELETE FROM mensagens_enviadas WHERE whatsapp_number = $1`, [numero]);
    await client.query(`DELETE FROM leads WHERE id = $1`, [leadId]);
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function leadExiste(leadId: string): Promise<boolean> {
  const result = await pool.query(`SELECT 1 FROM leads WHERE id = $1`, [leadId]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Unidade efetiva do lead (confirmada, senão recomendada) pra checagem de
 * permissão do estágio 3 — atendente só age em lead da(s) unidade(s) dele.
 * `null` de retorno diferencia "não existe" de "existe mas sem unidade
 * decidida ainda" (que o autor.repo trata como visível a todo atendente).
 */
export async function buscarUnidadeEfetivaDoLead(leadId: string): Promise<{ unidade: UnidadeRecomendada | null } | null> {
  const result = await pool.query<{ unidade: UnidadeRecomendada | null }>(
    `SELECT COALESCE(unidade_confirmada, unidade_recomendada) AS unidade FROM leads WHERE id = $1`,
    [leadId]
  );
  return result.rows[0] ?? null;
}

export interface LeadResumoDiario {
  id: string;
  nome_cliente: string | null;
  whatsapp_number: string;
  email: string | null;
  tipo_evento: string | null;
  data_evento: string | null;
  status: StatusLead;
  unidade: UnidadeRecomendada | null;
}

/**
 * Leads ainda em aberto (fora de 'fechado'/'perdido') roteados para alguma
 * das unidades informadas — base do resumo diário de leads por vendedor
 * (vendorDailyDigest.cron.ts). Usa a mesma unidade EFETIVA (confirmada,
 * senão recomendada) que o resto do sistema já usa pra decidir quem vê o quê.
 */
export async function buscarLeadsAtivosPorUnidades(unidades: UnidadeRecomendada[]): Promise<LeadResumoDiario[]> {
  if (unidades.length === 0) return [];

  const result = await pool.query<LeadResumoDiario>(
    `SELECT id, nome_cliente, whatsapp_number, email, tipo_evento, status,
            -- to_char em vez de deixar o driver devolver Date: o pg converte
            -- DATE pra objeto Date por padrão, e um Date.toString() cru no
            -- texto da mensagem sai como "Tue Dec 01 2026 00:00:00 GMT-0300...".
            to_char(data_evento, 'DD/MM/YYYY') AS data_evento,
            COALESCE(unidade_confirmada, unidade_recomendada) AS unidade
     FROM leads
     WHERE status NOT IN ('fechado', 'perdido')
       AND COALESCE(unidade_confirmada, unidade_recomendada) = ANY($1)
     ORDER BY ultima_interacao DESC`,
    [unidades]
  );
  return result.rows;
}

export interface ContextoLead {
  nomeCliente: string | null;
  tipoEvento: string | null;
  dataEvento: string | null;
  numeroConvidados: number | null;
  resumoPedido: string | null;
  unidade: UnidadeRecomendada | null;
}

/**
 * Só os dados do PRÓPRIO pedido do lead, já coletados — nenhum fato do
 * negócio (preço, endereço, política). É o teto do que o bot pode usar pra
 * responder uma dúvida sozinho durante a ociosidade do vendedor (Seção 5):
 * qualquer coisa fora daqui é "sensível" por definição, nunca inventada.
 */
export async function buscarContextoLead(leadId: string): Promise<ContextoLead | null> {
  const result = await pool.query<{
    nome_cliente: string | null;
    tipo_evento: string | null;
    data_evento: string | null;
    numero_convidados: number | null;
    resumo_pedido: string | null;
    unidade: UnidadeRecomendada | null;
  }>(
    `SELECT nome_cliente, tipo_evento, data_evento, numero_convidados, resumo_pedido,
            COALESCE(unidade_confirmada, unidade_recomendada) AS unidade
       FROM leads WHERE id = $1`,
    [leadId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    nomeCliente: row.nome_cliente,
    tipoEvento: row.tipo_evento,
    dataEvento: row.data_evento,
    numeroConvidados: row.numero_convidados,
    resumoPedido: row.resumo_pedido,
    unidade: row.unidade,
  };
}
