import type { Logger } from "pino";
import { pool } from "../db/client";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { extractFromMessage, ExtractedLeadData } from "./anthropic.service";
import { determinarUnidadeRecomendada, UnidadeRecomendada } from "./routing.service";
import { detectarGatilhoHandoff, calcularSlaMinutos, dentroDoHorarioComercial, GatilhoHandoff } from "./handoff.service";
import { registrarSaudacaoSeNecessario } from "./saudacao.service";
import { obterConfig } from "./config.service";
import { sendHandoffNotificationEmail, sendHandoffFollowUpEmail } from "./email.service";
import { notificarVendedor } from "./whatsapp.service";
import { upsertLead, adicionarTag } from "../repositories/leads.repo";
import { insertDemandSignal } from "../repositories/demandSignals.repo";
import {
  upsertConversationState,
  getEstadoHandoff,
  atualizarTentativasSemClassificacao,
  marcarEmAtendimentoHumano,
} from "../repositories/conversationState.repo";

const PALAVRAS_RELEVANTES = [
  "orçamento",
  "orcamento",
  "festa",
  "evento",
  "preço",
  "preco",
  "casamento",
  "aniversário",
  "aniversario",
  "15 anos",
  "debutante",
  "chá de bebê",
  "cha de bebe",
];

export function isMensagemRelevante(mensagem: string): boolean {
  const texto = mensagem.toLowerCase();
  return PALAVRAS_RELEVANTES.some((termo) => texto.includes(termo));
}

function apenasDigitos(numero: string): string {
  return numero.replace(/\D/g, "");
}

/**
 * O número do vendedor é da equipe, não é lead. Sem este filtro, qualquer
 * mensagem dele que contenha uma palavra relevante (ex.: "tem festa hoje?")
 * criaria um lead com o próprio número do vendedor, dispararia confirmação
 * automática, régua de mídia e follow-up em cima dele.
 *
 * Isso importa na prática porque o contorno da janela de 24h da Meta depende
 * do vendedor mandar mensagem pro bot todo dia (ver ENVIRONMENT.md).
 */
export function isNumeroDaEquipe(whatsappNumber: string): boolean {
  if (!env.VENDEDOR_WHATSAPP_NUMBER) return false;
  return apenasDigitos(whatsappNumber) === apenasDigitos(env.VENDEDOR_WHATSAPP_NUMBER);
}

export interface ResultadoHandoff {
  emAtendimentoHumano: boolean;
  /** Só preenchido quando ESTA mensagem disparou um handoff novo (não quando o lead já estava em atendimento humano). */
  gatilhoNovo: GatilhoHandoff | null;
}

export type ProcessResult =
  /**
   * `saudar` sai daqui em vez de a saudação ser enviada lá dentro porque esta
   * função serve tanto ao webhook do WhatsApp quanto ao endpoint genérico de
   * ingestão — e só o primeiro deve responder ao cliente. Quem chama é que
   * sabe se existe conversa de WhatsApp para responder.
   */
  | { status: "ignorado"; motivo: string; saudar?: boolean }
  | {
      status: "processado";
      leadId: string;
      dadosExtraidos: ExtractedLeadData;
      unidadeRecomendada: UnidadeRecomendada | null;
      handoff: ResultadoHandoff;
    }
  | { status: "erro"; erro: string };

/**
 * Decide e aplica o handoff (Seção 5): se o lead já estava em atendimento
 * humano, só avisa que chegou mensagem nova (sem reiniciar o fluxo). Senão,
 * checa os gatilhos imediatos e, se algum disparar, marca a conversa e
 * notifica por e-mail. Falha no envio de e-mail é logada mas não impede a
 * marcação do estado — melhor o bot ficar quieto do que responder por cima
 * de um handoff que não foi notificado.
 */
async function processarHandoff(
  whatsappNumber: string,
  leadId: string,
  mensagem: string,
  extracted: ExtractedLeadData,
  unidadeRecomendada: UnidadeRecomendada | null,
  log: Logger,
  /**
   * Quando o script guiado está ativo, quem decide o handoff são os nós dele —
   * e não a classificação da IA. Sem esta chave os dois decidiriam ao mesmo
   * tempo: o cliente perguntaria "quanto custa?" no meio da qualificação, a IA
   * marcaria `pergunta_valor`, e o lead iria pro vendedor no exato caso que o
   * script foi feito para evitar.
   */
  detectarPorIa: boolean
): Promise<ResultadoHandoff> {
  const estadoAnterior = await getEstadoHandoff(leadId);
  const semClassificacaoAgora = extracted.ramo == null && extracted.tipo_evento == null;
  const novasTentativas = semClassificacaoAgora ? estadoAnterior.tentativasSemClassificacao + 1 : 0;

  if (estadoAnterior.emAtendimentoHumano) {
    await atualizarTentativasSemClassificacao(leadId, novasTentativas);
    try {
      await sendHandoffFollowUpEmail({ whatsappNumber, nomeCliente: extracted.nome_cliente, mensagemOriginal: mensagem });
    } catch (error) {
      log.error({ err: error }, "falha ao notificar novo contato de lead em atendimento humano");
    }
    return { emAtendimentoHumano: true, gatilhoNovo: null };
  }

  if (!detectarPorIa) {
    await atualizarTentativasSemClassificacao(leadId, novasTentativas);
    return { emAtendimentoHumano: false, gatilhoNovo: null };
  }

  const config = await obterConfig();
  const decisao = detectarGatilhoHandoff(mensagem, extracted.sinal_engajamento, novasTentativas, config.handoff);
  await atualizarTentativasSemClassificacao(leadId, decisao ? 0 : novasTentativas);

  if (!decisao) {
    return { emAtendimentoHumano: false, gatilhoNovo: null };
  }

  await notificarHandoff({
    whatsappNumber,
    leadId,
    mensagem,
    extracted,
    unidadeRecomendada,
    gatilho: decisao.gatilho,
    paraGerente: decisao.paraGerente,
    log,
  });

  return { emAtendimentoHumano: true, gatilhoNovo: decisao.gatilho };
}

/**
 * Marca o lead como em atendimento humano e avisa o vendedor (e-mail +
 * WhatsApp).
 *
 * Vive separada de `processarHandoff` porque existem dois caminhos que chegam
 * ao mesmo lugar: a detecção por IA (endpoint genérico de ingestão) e o script
 * guiado, que decide o handoff pelos próprios nós. Duplicar a notificação nos
 * dois seria a receita para um deles esquecer de avisar o vendedor.
 */
export async function notificarHandoff(params: {
  whatsappNumber: string;
  leadId: string;
  mensagem: string;
  extracted: ExtractedLeadData;
  unidadeRecomendada: UnidadeRecomendada | null;
  gatilho: GatilhoHandoff;
  paraGerente: boolean;
  log: Logger;
}): Promise<void> {
  const { whatsappNumber, leadId, mensagem, extracted, unidadeRecomendada, gatilho, paraGerente, log } = params;
  const config = await obterConfig();

  await marcarEmAtendimentoHumano(leadId);
  if (gatilho === "falha_classificacao_repetida" || gatilho === "precisa_qualificacao_humana") {
    await adicionarTag(leadId, "precisa_qualificacao_humana");
  }

  const slaMinutos = calcularSlaMinutos(unidadeRecomendada, extracted.ramo, config.sla);
  const emHorarioComercial = dentroDoHorarioComercial(new Date(), config.horario);

  try {
    await sendHandoffNotificationEmail({
      whatsappNumber,
      nomeCliente: extracted.nome_cliente,
      ramo: extracted.ramo,
      unidadeRecomendada,
      gatilho,
      paraGerente,
      slaMinutos,
      dentroDoHorarioComercial: emHorarioComercial,
      resumoPedido: extracted.resumo_pedido,
      mensagemOriginal: mensagem,
    });
  } catch (error) {
    log.error({ err: error, gatilho }, "falha ao notificar handoff por e-mail");
  }

  // Notificação no WhatsApp do vendedor, em paralelo ao e-mail (Seção 5). Pode
  // falhar se a janela de 24h da Meta estiver fechada — por isso o e-mail
  // continua sendo o canal confiável e a falha aqui não interrompe o handoff.
  try {
    await notificarVendedor({
      whatsappCliente: whatsappNumber,
      nomeCliente: extracted.nome_cliente,
      email: extracted.email,
      ramo: extracted.ramo,
      unidadeRecomendada,
      dataEvento: extracted.data_evento,
      numeroConvidados: extracted.numero_convidados,
      orcamentoMencionado: extracted.orcamento_mencionado,
      resumoPedido: extracted.resumo_pedido,
      objecaoOuDuvida: extracted.objecao_ou_duvida,
      gatilho,
      paraGerente,
      slaMinutos,
      dentroDoHorarioComercial: emHorarioComercial,
      mensagemOriginal: mensagem,
      dadosRamo: extracted.dados_ramo as unknown as Record<string, unknown>,
    });
    log.info("vendedor notificado no WhatsApp");
  } catch (error) {
    log.error(
      { err: error, gatilho },
      "falha ao notificar vendedor no WhatsApp — verifique a janela de 24h da Meta; e-mail segue como canal de registro"
    );
  }

  log.info({ gatilho, paraGerente }, "handoff disparado");
}

/**
 * Núcleo do pipeline (seção 6.1 da especificação): salva o payload bruto,
 * filtra relevância, extrai via IA, e grava lead + sinal de demanda.
 * Usado tanto pelo endpoint de ingestão genérico quanto pelo webhook do
 * WhatsApp Cloud API — cada um decide separadamente se/como responder ao
 * cliente depois de chamar esta função.
 *
 * Cada chamada gera um `rawMessageId`, que vira o fio condutor dos logs
 * (Etapa 8): dá pra filtrar todos os eventos de UMA mensagem específica com
 * `grep <rawMessageId>` no log, do recebimento até o resultado final.
 */
export interface OpcoesProcessamento {
  /**
   * Com o script guiado ativo, TODA mensagem precisa ser processada: o cliente
   * responde "2" a um menu, e "2" não tem termo relevante nenhum. Manter o
   * filtro ligado faria o fluxo travar na primeira resposta curta.
   */
  exigirRelevancia?: boolean;
  /** Ver `detectarPorIa` em processarHandoff. */
  detectarHandoffPorIa?: boolean;
}

export async function processIncomingMessage(
  whatsappNumber: string,
  mensagem: string,
  payloadBruto: unknown,
  opcoes: OpcoesProcessamento = {}
): Promise<ProcessResult> {
  // Antes de qualquer gravação: mensagem da própria equipe não vira lead.
  if (isNumeroDaEquipe(whatsappNumber)) {
    logger.info({ whatsappNumber }, "mensagem do número da equipe (vendedor) — ignorada, não é lead");
    return { status: "ignorado", motivo: "número da equipe, não é lead" };
  }

  const rawResult = await pool.query<{ id: string }>(
    `INSERT INTO raw_messages (whatsapp_number, mensagem_original, payload_bruto, processado)
     VALUES ($1, $2, $3, false) RETURNING id`,
    [whatsappNumber, mensagem, JSON.stringify(payloadBruto)]
  );
  const rawMessageId = rawResult.rows[0].id;
  const log = logger.child({ rawMessageId, whatsappNumber });

  log.info("mensagem recebida e gravada em raw_messages");

  if (opcoes.exigirRelevancia !== false && !isMensagemRelevante(mensagem)) {
    await pool.query(`UPDATE raw_messages SET processado = true WHERE id = $1`, [rawMessageId]);

    // Sem termos relevantes não dá pra qualificar nada — mas ficar mudo é pior:
    // "oi" e "bom dia" são a abertura de conversa mais comum, e o silêncio faz
    // o cliente concluir que o número está morto. Uma apresentação convida a
    // dizer o que precisa, e aí a mensagem seguinte já entra no fluxo normal.
    let saudar = false;
    try {
      saudar = await registrarSaudacaoSeNecessario(whatsappNumber);
    } catch (error) {
      // Falha aqui não pode escalar: a mensagem já foi marcada como processada
      // e não havia nada a extrair dela de qualquer forma.
      log.error({ err: error }, "falha ao verificar saudação de primeiro contato");
    }

    log.info({ saudar }, "mensagem ignorada — sem termos relevantes");
    return { status: "ignorado", motivo: "mensagem sem termos relevantes", saudar };
  }

  log.debug("mensagem relevante — iniciando extração via IA");

  try {
    const extracted = await extractFromMessage(mensagem);
    log.debug({ tipo_evento: extracted.tipo_evento, ramo: extracted.ramo }, "extração concluída");

    const unidadeRecomendada = determinarUnidadeRecomendada(
      extracted.ramo,
      extracted.dados_ramo,
      extracted.numero_convidados,
      extracted.orcamento_mencionado
    );

    const leadId = await upsertLead(whatsappNumber, extracted, unidadeRecomendada);
    await insertDemandSignal(leadId, mensagem, extracted);
    await upsertConversationState(leadId, extracted.ramo, extracted.dados_ramo);

    const handoff = await processarHandoff(
      whatsappNumber,
      leadId,
      mensagem,
      extracted,
      unidadeRecomendada,
      log,
      opcoes.detectarHandoffPorIa !== false
    );

    await pool.query(`UPDATE raw_messages SET processado = true WHERE id = $1`, [rawMessageId]);

    log.info(
      { leadId, ramo: extracted.ramo, unidadeRecomendada, emAtendimentoHumano: handoff.emAtendimentoHumano },
      "lead e sinal de demanda gravados com sucesso"
    );
    return { status: "processado", leadId, dadosExtraidos: extracted, unidadeRecomendada, handoff };
  } catch (error) {
    // Em caso de erro, NÃO marca processado = true (permite reprocessamento manual — seção 6.1.h).
    await pool.query(`UPDATE raw_messages SET erro = $1 WHERE id = $2`, [String(error), rawMessageId]);
    log.error({ err: error }, "falha ao processar mensagem — marcada para reprocessamento manual");
    return { status: "erro", erro: String(error) };
  }
}
