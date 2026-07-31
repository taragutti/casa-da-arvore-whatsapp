import { logger } from "../config/logger";
import { DadosPorRamo, RamoEvento, SinalEngajamento } from "./anthropic.service";
import { UnidadeRecomendada } from "./routing.service";
import { sendWhatsAppImage, sendWhatsAppVideo, sendWhatsAppDocument, sendWhatsAppMessage } from "./whatsapp.service";
import { buscarMidias, ETAPAS_MIDIA } from "../repositories/mediaLibrary.repo";
import { getEtapaMidiaAtual, registrarEnvioMidia } from "../repositories/conversationState.repo";
import { agendarFollowUp } from "./followUp.service";

export type EtapaMidia = 1 | 2 | 3 | 4;

// Ramo E — Recreação Avulsa (Seção 3.5): oferecer cupom de desconto pra
// conversão em festa fechada. Texto autoral, sem valor/código real de
// desconto — a Seção 3.5 pede a oferta mas não define o cupom em si.
// Ajustar antes de confiar em produção, e revisar se precisa virar template
// aprovado (é enviada em resposta imediata, dentro da janela de 24h, então
// texto livre deve funcionar por enquanto).
const OFERTA_CUPOM_RECREACAO_AVULSA =
  "Aproveitando: temos uma condição especial de desconto pra quem quiser transformar essa recreação avulsa numa festa fechada aqui na Casa da Árvore ou no Park Lagos! Quer saber mais sobre essa condição? 🌳";

export type AcaoMidia =
  | { tipo: "enviar"; etapa: EtapaMidia }
  | { tipo: "aguardar_handoff" } // régua esgotada — Seção 5 (ainda não implementada) decide a notificação
  | { tipo: "nenhuma" };

/**
 * Decide a próxima ação da régua de mídia progressiva (Seção 4 do fluxo
 * detalhado). Só cobre o que a Seção 4 define — sinais que são gatilho de
 * handoff (Seção 5, ex.: pedido_visita) não avançam mídia aqui de propósito;
 * eles serão tratados quando a Seção 5 for implementada.
 */
export function decidirProximaAcaoMidia(
  ramo: RamoEvento | null,
  etapaAtual: number | null,
  sinal: SinalEngajamento
): AcaoMidia {
  // Exceção corporativo (Ramo D): etapa 1 mantida, etapa 2 opcional (pulada
  // aqui de propósito), etapas 3 e 4 comprimidas e enviadas juntas, sem
  // esperar sinal de engajamento.
  if (ramo === "corporativo") {
    if (etapaAtual == null) return { tipo: "enviar", etapa: 1 };
    if (etapaAtual < 4) return { tipo: "enviar", etapa: 4 };
    return { tipo: "aguardar_handoff" };
  }

  if (etapaAtual == null) {
    return { tipo: "enviar", etapa: 1 };
  }

  if (etapaAtual >= 4) {
    return { tipo: "aguardar_handoff" };
  }

  if (sinal === "pergunta_valor") {
    return { tipo: "enviar", etapa: 4 }; // pula direto pra etapa 4, independente da etapa atual
  }

  if (sinal === "positivo") {
    return { tipo: "enviar", etapa: (etapaAtual + 1) as EtapaMidia };
  }

  // negativo, neutro ou pedido_visita: não avança a régua de mídia.
  return { tipo: "nenhuma" };
}

/**
 * Heurística provisória de perfil de lead para curadoria de mídia (Seção 4 —
 * a "Estratégia de Envio de Mídias, Parte 4" que definiria os perfis reais
 * não está disponível nesta base). Ajustar assim que esse documento existir.
 */
function inferirPerfilLead(ramo: RamoEvento | null, dadosRamo: DadosPorRamo, numeroConvidados: number | null): string | null {
  if (ramo === "infantil") {
    return numeroConvidados != null && numeroConvidados > 100 ? "infantil_grande" : "infantil_pequeno";
  }
  if (ramo === "casamento") {
    return dadosRamo.origem_casal === "outra_cidade" || dadosRamo.origem_casal === "exterior" ? "destination" : null;
  }
  return null;
}

/** Envia a mídia da etapa; retorna false (sem lançar) se media_library não tiver nada ativo pra essa etapa/unidade. */
/**
 * Pausa entre fotos do mesmo lote. Serve a dois propósitos: não disparar
 * requisições em rajada contra a API da Meta, e garantir que as fotos cheguem
 * na ordem em que foram enviadas (sem pausa, envios concorrentes podem ser
 * entregues fora de ordem).
 */
const PAUSA_ENTRE_FOTOS_MS = 500;

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Envia um lote de fotos tolerando falha individual.
 *
 * A falha de UMA foto não pode abortar o lote: se abortasse, `registrarEnvioMidia`
 * não rodaria na função chamadora, a etapa continuaria pendente, e a próxima
 * mensagem do cliente reenviaria o lote inteiro desde o começo — ele receberia
 * as primeiras fotos duas vezes. Com lote grande isso deixa de ser detalhe e
 * vira spam de verdade.
 *
 * Por isso: registra o que falhou, segue com as demais, e devolve `true` se ao
 * menos uma chegou. Perder uma foto é melhor que duplicar o lote.
 */
async function enviarLoteDeFotos(
  whatsappNumber: string,
  midias: { codigo: string; url: string }[],
  unidade: UnidadeRecomendada
): Promise<boolean> {
  let enviadas = 0;

  for (const [indice, foto] of midias.entries()) {
    try {
      await sendWhatsAppImage(whatsappNumber, foto.url);
      enviadas++;
    } catch (error) {
      logger.error(
        { err: error, codigo: foto.codigo, unidade, posicao: indice + 1, total: midias.length },
        "falha ao enviar foto do lote — seguindo com as demais"
      );
    }

    if (indice < midias.length - 1) await esperar(PAUSA_ENTRE_FOTOS_MS);
  }

  if (enviadas < midias.length) {
    logger.warn({ unidade, enviadas, total: midias.length }, "lote de fotos enviado parcialmente");
  }

  return enviadas > 0;
}

/**
 * Distinguir "não tem material" de "tentou e falhou" é essencial: a primeira
 * situação deve PULAR para a etapa seguinte (a régua não pode congelar por
 * material que nunca foi cadastrado), a segunda NÃO — falha de rede é
 * temporária, e pular por causa dela faria o cliente receber o catálogo em vez
 * das fotos, com as fotos marcadas como já passadas.
 */
type ResultadoEnvioEtapa = "enviado" | "sem_midia" | "falhou";

async function enviarEtapaMidia(
  whatsappNumber: string,
  unidade: UnidadeRecomendada,
  etapa: EtapaMidia,
  perfilLead: string | null
): Promise<ResultadoEnvioEtapa> {
  // tipo/categoria/quantidade vêm de ETAPAS_MIDIA, a mesma tabela que o painel
  // usa para cadastrar. Duplicar esses valores aqui faria mídia cadastrada por
  // uma etapa nunca ser encontrada pela outra ponta.
  const { tipo, categoria, quantidade } = ETAPAS_MIDIA[etapa];

  // Só a etapa 3 é curada por perfil de lead (fotos de eventos reais); nas
  // outras o material é institucional e igual para todos.
  const midias = await buscarMidias(unidade, tipo, categoria, etapa === 3 ? perfilLead : null, quantidade);
  if (midias.length === 0) return "sem_midia";

  // Nas etapas de item único, uma exceção do envio propaga de propósito: o
  // chamador não registra avanço e a régua tenta de novo na mensagem seguinte.
  switch (etapa) {
    case 1:
      await sendWhatsAppImage(whatsappNumber, midias[0]!.url);
      return "enviado";
    case 2:
      await sendWhatsAppVideo(whatsappNumber, midias[0]!.url);
      return "enviado";
    case 3:
      // O lote engole falha individual, então precisa dizer se algo saiu.
      return (await enviarLoteDeFotos(whatsappNumber, midias, unidade)) ? "enviado" : "falhou";
    case 4:
      await sendWhatsAppDocument(whatsappNumber, midias[0]!.url, `Catalogo-${unidade}.pdf`);
      return "enviado";
  }
}

/**
 * Orquestra a régua de mídia progressiva para uma mensagem já processada:
 * lê a etapa atual, decide a próxima ação e envia via WhatsApp. Chamado só
 * no caminho do WhatsApp de teste/produção (mesma condição que já dispara a
 * confirmação automática em processMessage.job.ts).
 */
export async function processarMidiaProgressiva(
  whatsappNumber: string,
  leadId: string,
  ramo: RamoEvento | null,
  unidadeRecomendada: UnidadeRecomendada | null,
  dadosRamo: DadosPorRamo,
  numeroConvidados: number | null,
  sinal: SinalEngajamento
): Promise<void> {
  const log = logger.child({ leadId });

  if (!unidadeRecomendada) {
    log.debug("sem unidade recomendada ainda — motor de mídia aguarda mais dados do lead");
    return;
  }

  const etapaAtual = await getEtapaMidiaAtual(leadId);
  const acao = decidirProximaAcaoMidia(ramo, etapaAtual, sinal);

  if (acao.tipo === "aguardar_handoff") {
    // Régua de mídia esgotada não dispara handoff automaticamente aqui — só
    // os gatilhos explícitos da Seção 5 (handoff.service.ts) fazem isso.
    // Ver nota na Seção 4 sobre a sobreposição entre "handoff em 1-3 min
    // após etapa 4" e os gatilhos da Seção 5.
    log.info({ etapaAtual }, "régua de mídia esgotada — aguardando gatilho de handoff (Seção 5)");
    return;
  }

  if (acao.tipo === "nenhuma") {
    return;
  }

  const perfilLead = inferirPerfilLead(ramo, dadosRamo, numeroConvidados);

  // Etapa sem material não pode CONGELAR a régua. Antes, se a etapa alvo
  // estivesse vazia a função saía sem registrar avanço — e a próxima mensagem
  // do cliente tentava a mesma etapa vazia outra vez, para sempre. O efeito era
  // silencioso e caro: uma unidade com foto na etapa 1, etapa 2 vazia e 10
  // fotos na etapa 3 travava na 1, e as 10 nunca chegavam a ninguém.
  //
  // Só avança para FRENTE: recuar não faz sentido (o salto para o catálogo em
  // pergunta_valor não deve virar envio de foto de evento).
  let etapaEnviada: EtapaMidia | null = null;
  for (let etapa = acao.etapa; etapa <= 4; etapa++) {
    const resultado = await enviarEtapaMidia(whatsappNumber, unidadeRecomendada, etapa as EtapaMidia, perfilLead);

    if (resultado === "enviado") {
      etapaEnviada = etapa as EtapaMidia;
      break;
    }

    if (resultado === "falhou") {
      // Não pula: a etapa TEM material, o envio é que falhou. Sem registrar
      // avanço, a régua tenta esta mesma etapa na próxima mensagem.
      log.error({ unidadeRecomendada, etapa }, "envio da etapa falhou — régua mantida para nova tentativa");
      return;
    }

    log.warn(
      { unidadeRecomendada, etapa },
      "etapa sem mídia ativa em media_library — pulando para a próxima com material"
    );
  }

  if (etapaEnviada == null) {
    log.warn(
      { unidadeRecomendada, etapaAlvo: acao.etapa },
      "nenhuma etapa a partir da alvo tem mídia ativa — biblioteca precisa ser populada"
    );
    return;
  }

  await registrarEnvioMidia(leadId, etapaEnviada);
  log.info(
    { unidadeRecomendada, etapa: etapaEnviada, etapaAlvo: acao.etapa },
    "mídia da régua progressiva enviada"
  );

  // Ramo E (Seção 3.5): oferece o cupom de conversão junto com a primeira
  // mídia que o cliente recebe.
  //
  // A condição olha `acao.etapa` (o alvo da régua), não `etapaEnviada`: se a
  // etapa 1 estiver vazia e o envio pular para a 3, aquela ainda é a PRIMEIRA
  // mídia daquele lead, e o cupom deve ir junto. Continua disparando uma única
  // vez sem estado extra, porque a régua só tem a etapa 1 como alvo enquanto
  // nada foi enviado.
  if (ramo === "recreacao_avulsa" && acao.etapa === 1) {
    try {
      await sendWhatsAppMessage(whatsappNumber, OFERTA_CUPOM_RECREACAO_AVULSA);
      log.info("oferta de cupom de conversão enviada (ramo recreação avulsa)");
    } catch (error) {
      log.error({ err: error }, "falha ao enviar oferta de cupom");
    }
  }

  // Régua de silêncio (Seção 6): agenda o follow-up de 2h a partir daqui.
  await agendarFollowUp(leadId, whatsappNumber);
}

// Texto autoral (o fluxo não define esta mensagem). Explica por que o bot para
// de responder — sem isso o cliente recebe uma foto e depois silêncio, e não
// tem como saber que alguém já foi acionado.
const AVISO_CONSULTOR_A_CAMINHO =
  "Enquanto isso, olha só como é o espaço 🌳 Já avisei nosso consultor e ele vai te chamar aqui pelo WhatsApp pra falar sobre valores e disponibilidade!";

/**
 * Mídia de espera no handoff: quando o lead vai pro vendedor, o bot fica mudo
 * (processMessage.job.ts) e o cliente pode esperar minutos — ou horas, fora do
 * horário comercial. Esta função preenche esse vazio com a foto da etapa 1.
 *
 * Diferente de `processarMidiaProgressiva` em dois pontos deliberados:
 *
 * 1. NÃO agenda follow-up. O lead passou a ser do vendedor; o bot cobrando o
 *    cliente em 2h atropelaria a conversa humana em andamento.
 * 2. Só envia quando NADA foi enviado ainda (etapa atual nula). Se o cliente já
 *    recebeu mídia, ele já viu o espaço — mandar mais junto do handoff viraria
 *    ruído em cima da entrada do vendedor.
 */
export async function enviarMidiaDeEspera(
  whatsappNumber: string,
  leadId: string,
  ramo: RamoEvento | null,
  unidadeRecomendada: UnidadeRecomendada | null,
  dadosRamo: DadosPorRamo,
  numeroConvidados: number | null
): Promise<void> {
  const log = logger.child({ leadId });

  if (!unidadeRecomendada) {
    log.debug("handoff sem unidade definida — sem mídia de espera");
    return;
  }

  if ((await getEtapaMidiaAtual(leadId)) != null) {
    log.debug("lead já recebeu mídia antes do handoff — sem mídia de espera");
    return;
  }

  const perfilLead = inferirPerfilLead(ramo, dadosRamo, numeroConvidados);
  const resultado = await enviarEtapaMidia(whatsappNumber, unidadeRecomendada, 1, perfilLead);

  // Comparação explícita: o retorno é uma string, e `!resultado` seria sempre
  // falso — o TypeScript não acusaria, e o handoff seguiria registrando envio
  // que não aconteceu.
  if (resultado !== "enviado") {
    log.warn(
      { unidadeRecomendada, resultado },
      "sem foto de etapa 1 para esta unidade — cliente fica sem retorno visual no handoff"
    );
    return;
  }

  await registrarEnvioMidia(leadId, 1);

  try {
    await sendWhatsAppMessage(whatsappNumber, AVISO_CONSULTOR_A_CAMINHO);
  } catch (error) {
    // A foto já foi: o aviso é complemento, não vale derrubar o handoff por ele.
    log.error({ err: error }, "falha ao enviar aviso de consultor a caminho");
  }

  log.info({ unidadeRecomendada }, "mídia de espera enviada no handoff");
}
