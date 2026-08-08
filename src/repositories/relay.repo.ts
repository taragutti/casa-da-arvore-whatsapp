import { pool } from "../db/client";

/**
 * A Meta manda o `from` do webhook sem "+" e a configuração guarda o número
 * com "+" — comparar/gravar sempre só com dígitos evita o mesmo vendedor
 * existir em duas grafias (o mesmo problema que `isNumeroDaEquipe` já trata).
 */
export function normalizarNumero(numero: string): string {
  return numero.replace(/\D/g, "");
}

export interface AtendimentoRelay {
  leadId: string;
  numeroVendedor: string;
  selecionado: boolean;
  abertoEm: Date;
  nomeCliente: string | null;
  whatsappCliente: string;
}

/**
 * Abre (ou reaproveita) o atendimento do vendedor para este lead.
 *
 * Se o vendedor não tem NENHUM outro atendimento selecionado, este já nasce
 * selecionado — o caso comum (um lead por vez) funciona sem o vendedor
 * precisar aprender comando nenhum. Se já existe um selecionado, o novo entra
 * na fila sem roubar o foco: trocar de cliente no meio de uma frase seria
 * pior que pedir um "#2" explícito.
 */
export async function abrirAtendimento(numeroVendedor: string, leadId: string): Promise<void> {
  const vendedor = normalizarNumero(numeroVendedor);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const jaAberto = await client.query(
      `SELECT id FROM relay_atendimentos WHERE numero_vendedor = $1 AND lead_id = $2 AND aberto`,
      [vendedor, leadId]
    );
    if (jaAberto.rows.length > 0) {
      await client.query("COMMIT");
      return;
    }

    const temSelecionado = await client.query(
      `SELECT 1 FROM relay_atendimentos WHERE numero_vendedor = $1 AND aberto AND selecionado`,
      [vendedor]
    );

    await client.query(
      `INSERT INTO relay_atendimentos (numero_vendedor, lead_id, selecionado)
       VALUES ($1, $2, $3)`,
      [vendedor, leadId, temSelecionado.rows.length === 0]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Atendimentos abertos do vendedor, na ordem em que foram abertos — a posição
 * na lista (1, 2, 3...) é o número que o vendedor usa nos comandos "#N".
 * Ordenar por `aberto_em` mantém os números estáveis enquanto nada fecha.
 */
export async function listarAtendimentosAbertos(numeroVendedor: string): Promise<AtendimentoRelay[]> {
  const result = await pool.query<{
    lead_id: string;
    numero_vendedor: string;
    selecionado: boolean;
    aberto_em: Date;
    nome_cliente: string | null;
    whatsapp_number: string;
  }>(
    `SELECT r.lead_id, r.numero_vendedor, r.selecionado, r.aberto_em, l.nome_cliente, l.whatsapp_number
     FROM relay_atendimentos r
     JOIN leads l ON l.id = r.lead_id
     WHERE r.numero_vendedor = $1 AND r.aberto
     ORDER BY r.aberto_em ASC`,
    [normalizarNumero(numeroVendedor)]
  );

  return result.rows.map((row) => ({
    leadId: row.lead_id,
    numeroVendedor: row.numero_vendedor,
    selecionado: row.selecionado,
    abertoEm: row.aberto_em,
    nomeCliente: row.nome_cliente,
    whatsappCliente: row.whatsapp_number,
  }));
}

/** Seleciona um atendimento aberto e desmarca os demais do mesmo vendedor. */
export async function selecionarAtendimento(numeroVendedor: string, leadId: string): Promise<boolean> {
  const vendedor = normalizarNumero(numeroVendedor);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE relay_atendimentos SET selecionado = false, atualizado_em = now()
       WHERE numero_vendedor = $1 AND aberto AND selecionado`,
      [vendedor]
    );
    const result = await client.query(
      `UPDATE relay_atendimentos SET selecionado = true, atualizado_em = now()
       WHERE numero_vendedor = $1 AND lead_id = $2 AND aberto`,
      [vendedor, leadId]
    );
    await client.query("COMMIT");
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Fecha o atendimento. Se era o selecionado e sobra exatamente UM aberto, o
 * que sobra é selecionado sozinho — de novo o caso comum sem comando extra.
 * Sobrando mais de um, nenhum fica selecionado: escolher pelo vendedor seria
 * chute, e mandar mensagem pro cliente errado é o pior desfecho possível.
 */
export async function fecharAtendimento(numeroVendedor: string, leadId: string): Promise<boolean> {
  const vendedor = normalizarNumero(numeroVendedor);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE relay_atendimentos SET aberto = false, selecionado = false, atualizado_em = now()
       WHERE numero_vendedor = $1 AND lead_id = $2 AND aberto`,
      [vendedor, leadId]
    );

    const restantes = await client.query<{ id: string }>(
      `SELECT id FROM relay_atendimentos WHERE numero_vendedor = $1 AND aberto`,
      [vendedor]
    );
    if (restantes.rows.length === 1) {
      await client.query(
        `UPDATE relay_atendimentos SET selecionado = true, atualizado_em = now() WHERE id = $1`,
        [restantes.rows[0].id]
      );
    }

    await client.query("COMMIT");
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Fecha TODOS os atendimentos abertos de um lead — usado quando o painel
 * devolve a conversa ao bot: sem isso, o relay do vendedor continuaria
 * apontando pro lead e a resposta dele iria pro cliente junto com o bot.
 * Para cada vendedor afetado, se sobra exatamente um atendimento aberto, ele
 * é selecionado (mesma regra de fecharAtendimento).
 */
export async function fecharAtendimentosDoLead(leadId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const fechados = await client.query<{ numero_vendedor: string }>(
      `UPDATE relay_atendimentos SET aberto = false, selecionado = false, atualizado_em = now()
       WHERE lead_id = $1 AND aberto
       RETURNING numero_vendedor`,
      [leadId]
    );

    const vendedores = [...new Set(fechados.rows.map((r) => r.numero_vendedor))];
    for (const vendedor of vendedores) {
      const restantes = await client.query<{ id: string }>(
        `SELECT id FROM relay_atendimentos WHERE numero_vendedor = $1 AND aberto`,
        [vendedor]
      );
      if (restantes.rows.length === 1) {
        await client.query(
          `UPDATE relay_atendimentos SET selecionado = true, atualizado_em = now()
           WHERE id = $1 AND NOT selecionado`,
          [restantes.rows[0].id]
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Quem é o vendedor deste lead, segundo o relay. Devolve o atendimento aberto
 * mais recente — usado para encaminhar mensagem nova do cliente pro vendedor
 * certo sem recalcular unidade/config (que podem ter mudado desde o handoff).
 */
export async function getVendedorDoLead(leadId: string): Promise<string | null> {
  const result = await pool.query<{ numero_vendedor: string }>(
    `SELECT numero_vendedor FROM relay_atendimentos
     WHERE lead_id = $1 AND aberto
     ORDER BY aberto_em DESC LIMIT 1`,
    [leadId]
  );
  return result.rows[0]?.numero_vendedor ?? null;
}

/** Trilha de auditoria: toda mensagem que passa pela ponte fica registrada, inclusive as que falharam. */
export async function registrarMensagemRelay(params: {
  leadId: string;
  numeroVendedor: string;
  direcao: "vendedor_para_cliente" | "cliente_para_vendedor";
  texto: string;
  entregue: boolean;
  erro?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO relay_mensagens (lead_id, numero_vendedor, direcao, texto, entregue, erro)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.leadId,
      normalizarNumero(params.numeroVendedor),
      params.direcao,
      params.texto,
      params.entregue,
      params.erro ?? null,
    ]
  );
}
