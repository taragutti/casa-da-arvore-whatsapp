import type { Logger } from "pino";
import { logger } from "../config/logger";
import { sendWhatsAppMessage } from "./whatsapp.service";
import { determinarNumeroVendedor } from "./handoff.service";
import { obterConfig } from "./config.service";
import { devolverAoBot } from "../repositories/conversationState.repo";
import { buscarContextoLead, buscarUnidadeEfetivaDoLead } from "../repositories/leads.repo";
import { responderDuvidaEmEspera } from "./anthropic.service";
import {
  abrirAtendimento,
  buscarAtendimento,
  fecharAtendimento,
  getVendedorDoLead,
  incrementarPerguntaBotRespondida,
  listarAtendimentosAbertos,
  marcarAvisoEsperaEnviado,
  normalizarNumero,
  registrarMensagemRelay,
  resetarAvisoEspera,
  selecionarAtendimento,
  vendedorRespondeuDesde,
  AtendimentoComAviso,
  AtendimentoRelay,
} from "../repositories/relay.repo";
import { vendorIdleQueue } from "../queue/vendorIdleQueue";

/**
 * Relay de atendimento humano (handover): depois do handoff, o vendedor
 * responde o cliente escrevendo PARA O NÚMERO DO BOT, e o bot repassa ao
 * cliente. Para o cliente é uma conversa só, contínua, no mesmo chat em que
 * ele falava com o bot — sem "agora te chamo de outro número".
 *
 * Texto começando com "#" é comando para o bot; qualquer outra coisa é
 * mensagem para o cliente selecionado. Os comandos existem por causa do caso
 * de dois leads simultâneos: sem um jeito explícito de trocar de cliente,
 * a resposta do vendedor poderia ir pra pessoa errada — o pior erro possível
 * numa ponte dessas.
 */

export type ComandoVendedor =
  | { tipo: "listar" }
  | { tipo: "selecionar"; posicao: number }
  | { tipo: "encerrar" }
  | { tipo: "devolver_ao_bot" }
  | { tipo: "ajuda" }
  | { tipo: "texto"; texto: string };

/**
 * Interpreta o que o vendedor mandou. Pura de propósito (sem banco), para os
 * testes cobrirem cada variação de digitação sem infraestrutura.
 *
 * Só reconhece comando quando a mensagem INTEIRA é o comando — "#2" troca de
 * cliente, mas "o valor é R$ 2#" é texto normal. Errar pra menos aqui é
 * seguro (vira texto e o vendedor percebe); errar pra mais engoliria mensagem
 * de verdade.
 */
export function interpretarComandoVendedor(mensagem: string): ComandoVendedor {
  const texto = mensagem.trim();
  if (!texto.startsWith("#")) return { tipo: "texto", texto };

  const comando = texto.slice(1).trim().toLowerCase();

  if (/^\d{1,2}$/.test(comando)) return { tipo: "selecionar", posicao: Number(comando) };
  if (comando === "leads" || comando === "lista") return { tipo: "listar" };
  if (comando === "fim" || comando === "encerrar" || comando === "fechar") return { tipo: "encerrar" };
  if (comando === "bot" || comando === "devolver") return { tipo: "devolver_ao_bot" };
  if (comando === "ajuda" || comando === "help" || comando === "?") return { tipo: "ajuda" };

  // "#" seguido de coisa não reconhecida: trata como comando errado, não como
  // texto — mandar "#fin" (typo) pro cliente exporia a cozinha da operação.
  return { tipo: "ajuda" };
}

const TEXTO_AJUDA = [
  "🤖 *Comandos do atendimento:*",
  "",
  "• Texto normal → vai pro cliente selecionado (✱)",
  "• *#leads* → lista seus atendimentos abertos",
  "• *#1*, *#2*... → troca o cliente selecionado",
  "• *#fim* → encerra o atendimento selecionado",
  "• *#bot* → encerra e devolve a conversa pro bot",
  "• *#ajuda* → mostra esta mensagem",
].join("\n");

function rotuloCliente(a: AtendimentoRelay): string {
  return a.nomeCliente ? `${a.nomeCliente} (${a.whatsappCliente})` : a.whatsappCliente;
}

function montarLista(atendimentos: AtendimentoRelay[]): string {
  if (atendimentos.length === 0) {
    return "Você não tem nenhum atendimento aberto no momento.";
  }
  const linhas = atendimentos.map(
    (a, i) => `${a.selecionado ? "✱" : "•"} *#${i + 1}* — ${rotuloCliente(a)}`
  );
  return ["📋 *Seus atendimentos abertos:*", "", ...linhas, "", "✱ = selecionado. Responda *#N* pra trocar."].join(
    "\n"
  );
}

/**
 * Aviso de ociosidade do vendedor: quebra o silêncio pro CLIENTE, sem mentir
 * e sem o bot fingir que é o consultor — só reduz a ansiedade de quem está
 * esperando e reabre uma porta pra tirar dúvida simples nesse meio-tempo.
 * Texto e prazo definidos com o usuário em sessão — ver ONDE-PARAMOS.md.
 */
const TEXTO_ESPERA_VENDEDOR =
  "Só um instante 🙏 nosso consultor está ocupado no momento e já te retorna. Se quiser já ir adiantando alguma dúvida, fico por aqui pra ajudar!";

/**
 * Dúvida fora do escopo seguro (preço, endereço, política, disponibilidade —
 * qualquer fato de negócio que o bot não tem confirmado): nunca inventa,
 * sempre desvia. Não conta como uma das 3 tentativas — só "segura" conta.
 */
const TEXTO_DUVIDA_SENSIVEL =
  "Essa parte específica meu consultor confirma certinho com você — já deixei anotado aqui pra ele responder assim que puder! 🙏";

/** Mandada uma vez, junto da 3ª resposta segura — fecha o ciclo sem deixar o cliente esperando resposta que não vai vir. */
const TEXTO_ENCERRAMENTO_DUVIDAS =
  "Vou aguardar meu consultor confirmar os detalhes com você a partir daqui, ele já te chama! 🙏";

/**
 * Agenda a checagem de ociosidade: se o vendedor não responder o cliente
 * dentro do prazo configurável (padrão 5 min), o bot manda a mensagem de
 * espera. Chamada tanto na abertura do handoff quanto a cada mensagem nova
 * do cliente — cada chamada tem seu próprio relógio, mas o aviso em si só sai
 * uma vez por janela de silêncio (ver `processarOciosidadeVendedor`).
 */
export async function agendarChecagemOciosidade(leadId: string, numeroVendedor: string): Promise<void> {
  const config = await obterConfig();
  await vendorIdleQueue.add(
    "vendor-idle",
    { leadId, numeroVendedor, esperandoDesde: new Date().toISOString() },
    { delay: config.avisoOciosidadeVendedorMinutos * 60 * 1000 }
  );
}

/**
 * Processa uma checagem agendada. Cancela silenciosamente (sem reagendar) se
 * o atendimento já fechou, se o vendedor respondeu desde `esperandoDesde`, ou
 * se o aviso já saiu nesta janela de silêncio — este último evita duplicar
 * quando o cliente manda várias mensagens antes do prazo estourar (cada uma
 * agenda sua própria checagem, mas só a primeira que chega a disparar avisa).
 */
export async function processarOciosidadeVendedor(
  leadId: string,
  numeroVendedor: string,
  esperandoDesde: string
): Promise<void> {
  const log = logger.child({ leadId, numeroVendedor });

  const atendimento = await buscarAtendimento(numeroVendedor, leadId);
  if (!atendimento) {
    log.debug("atendimento não está mais aberto — aviso de ociosidade cancelado");
    return;
  }

  if (atendimento.avisoEsperaEnviadoEm) {
    log.debug("aviso de ociosidade já enviado nesta janela de silêncio — cancelado");
    return;
  }

  const respondeu = await vendedorRespondeuDesde(leadId, numeroVendedor, new Date(esperandoDesde));
  if (respondeu) {
    log.debug("vendedor já respondeu — aviso de ociosidade cancelado");
    return;
  }

  try {
    await sendWhatsAppMessage(atendimento.whatsappCliente, TEXTO_ESPERA_VENDEDOR);
    await marcarAvisoEsperaEnviado(leadId, numeroVendedor);
    log.info("aviso de ociosidade do vendedor enviado ao cliente");
  } catch (error) {
    log.error({ err: error }, "falha ao enviar aviso de ociosidade do vendedor");
  }
}

async function responderVendedor(numeroVendedor: string, texto: string, log: Logger): Promise<void> {
  try {
    // O vendedor acabou de mandar mensagem pro bot, então a janela de 24h da
    // Meta está aberta por definição — texto livre entrega.
    await sendWhatsAppMessage(`+${normalizarNumero(numeroVendedor)}`, texto);
  } catch (error) {
    log.error({ err: error, numeroVendedor }, "falha ao responder o vendedor no relay");
  }
}

/**
 * Ponto de entrada para TODA mensagem que chega de um número da equipe.
 * Chamado pelo worker antes do pipeline normal (mensagem de vendedor não é
 * lead — isso o pipeline já garantia; agora ela passa a ter função).
 */
export async function processarMensagemDoVendedor(
  numeroVendedor: string,
  mensagem: string,
  log: Logger
): Promise<void> {
  const comando = interpretarComandoVendedor(mensagem);
  const atendimentos = await listarAtendimentosAbertos(numeroVendedor);
  const selecionado = atendimentos.find((a) => a.selecionado) ?? null;

  switch (comando.tipo) {
    case "ajuda":
      await responderVendedor(numeroVendedor, TEXTO_AJUDA, log);
      return;

    case "listar":
      await responderVendedor(numeroVendedor, montarLista(atendimentos), log);
      return;

    case "selecionar": {
      const alvo = atendimentos[comando.posicao - 1];
      if (!alvo) {
        await responderVendedor(
          numeroVendedor,
          `Não achei o atendimento *#${comando.posicao}*.\n\n${montarLista(atendimentos)}`,
          log
        );
        return;
      }
      await selecionarAtendimento(numeroVendedor, alvo.leadId);
      await responderVendedor(
        numeroVendedor,
        `✅ Agora você está falando com *${rotuloCliente(alvo)}*. Tudo que você mandar vai pra essa pessoa.`,
        log
      );
      return;
    }

    case "encerrar":
    case "devolver_ao_bot": {
      if (!selecionado) {
        await responderVendedor(
          numeroVendedor,
          `Nenhum atendimento selecionado pra encerrar.\n\n${montarLista(atendimentos)}`,
          log
        );
        return;
      }
      await fecharAtendimento(numeroVendedor, selecionado.leadId);

      let sufixo = "O lead continua marcado como atendimento humano (o bot segue quieto com ele).";
      if (comando.tipo === "devolver_ao_bot") {
        await devolverAoBot(selecionado.leadId);
        sufixo = "A conversa voltou pro bot: a próxima mensagem do cliente entra no fluxo automático.";
      }

      const restantes = await listarAtendimentosAbertos(numeroVendedor);
      const proximo = restantes.find((a) => a.selecionado);
      const linhaProximo = proximo
        ? `\n\nPróximo selecionado: *${rotuloCliente(proximo)}*.`
        : restantes.length > 0
          ? `\n\nVocê ainda tem ${restantes.length} atendimentos abertos — responda *#leads* pra escolher.`
          : "";

      await responderVendedor(
        numeroVendedor,
        `✅ Atendimento com *${rotuloCliente(selecionado)}* encerrado. ${sufixo}${linhaProximo}`,
        log
      );
      return;
    }

    case "texto": {
      if (comando.texto.length === 0) return;

      if (!selecionado) {
        await responderVendedor(
          numeroVendedor,
          `⚠️ Sua mensagem NÃO foi enviada: nenhum cliente selecionado.\n\n${montarLista(atendimentos)}`,
          log
        );
        return;
      }

      try {
        await sendWhatsAppMessage(selecionado.whatsappCliente, comando.texto, "vendedor");
        await registrarMensagemRelay({
          leadId: selecionado.leadId,
          numeroVendedor,
          direcao: "vendedor_para_cliente",
          texto: comando.texto,
          entregue: true,
        });
        // Vendedor respondeu: a próxima ociosidade merece um aviso novo.
        await resetarAvisoEspera(selecionado.leadId, numeroVendedor);
        log.info({ leadId: selecionado.leadId }, "mensagem do vendedor repassada ao cliente via relay");
      } catch (error) {
        log.error({ err: error, leadId: selecionado.leadId }, "falha ao repassar mensagem do vendedor ao cliente");
        await registrarMensagemRelay({
          leadId: selecionado.leadId,
          numeroVendedor,
          direcao: "vendedor_para_cliente",
          texto: comando.texto,
          entregue: false,
          erro: String(error),
        });
        // Falha silenciosa seria o vendedor achando que respondeu o cliente.
        await responderVendedor(
          numeroVendedor,
          `❌ NÃO consegui entregar sua mensagem pra *${rotuloCliente(selecionado)}*. Tente de novo em instantes.`,
          log
        );
      }
      return;
    }
  }
}

/**
 * Abre o atendimento no momento do handoff — chamado junto da notificação do
 * vendedor. Falha aqui não pode derrubar o handoff (o e-mail e o template já
 * saíram); o vendedor ainda conseguiria abrir na mão com #leads se a criação
 * atrasar num retry.
 */
export async function abrirAtendimentoRelay(numeroVendedor: string, leadId: string, log: Logger): Promise<void> {
  try {
    await abrirAtendimento(numeroVendedor, leadId);
    log.info({ leadId, numeroVendedor: normalizarNumero(numeroVendedor) }, "atendimento de relay aberto");
  } catch (error) {
    log.error({ err: error, leadId }, "falha ao abrir atendimento de relay no handoff");
    return;
  }

  try {
    await agendarChecagemOciosidade(leadId, numeroVendedor);
  } catch (error) {
    log.error({ err: error, leadId }, "falha ao agendar checagem de ociosidade do vendedor");
  }
}

/**
 * Se o aviso de ociosidade já disparou nesta janela de silêncio e ainda sobra
 * tentativa (máx. 3), tenta responder a dúvida do cliente sozinho — só com
 * dados que o próprio lead já informou (ver anthropic.service.ts). Qualquer
 * falha aqui é silenciosa: o encaminhamento pro vendedor abaixo acontece de
 * qualquer forma, então o cliente nunca fica sem nenhum caminho de resposta.
 */
async function tentarResponderDuvidaEmEspera(
  leadId: string,
  whatsappCliente: string,
  nomeCliente: string | null,
  mensagem: string,
  atendimento: AtendimentoComAviso,
  log: Logger
): Promise<void> {
  if (!atendimento.avisoEsperaEnviadoEm || atendimento.perguntasBotRespondidas >= 3) return;

  try {
    const contextoLead = await buscarContextoLead(leadId);
    const resultado = await responderDuvidaEmEspera(mensagem, {
      nomeCliente: contextoLead?.nomeCliente ?? nomeCliente,
      tipoEvento: contextoLead?.tipoEvento ?? null,
      dataEvento: contextoLead?.dataEvento ?? null,
      numeroConvidados: contextoLead?.numeroConvidados ?? null,
      resumoPedido: contextoLead?.resumoPedido ?? null,
      unidade: contextoLead?.unidade ?? null,
    });

    if (resultado.escopo === "segura" && resultado.resposta) {
      await sendWhatsAppMessage(whatsappCliente, resultado.resposta);
      const novoTotal = await incrementarPerguntaBotRespondida(leadId, atendimento.numeroVendedor);
      if (novoTotal >= 3) {
        await sendWhatsAppMessage(whatsappCliente, TEXTO_ENCERRAMENTO_DUVIDAS);
      }
      log.info({ leadId, novoTotal }, "bot respondeu dúvida segura durante ociosidade do vendedor");
    } else {
      await sendWhatsAppMessage(whatsappCliente, TEXTO_DUVIDA_SENSIVEL);
      log.info({ leadId }, "dúvida sensível durante ociosidade — bot desviou pro vendedor, sem gastar tentativa");
    }
  } catch (error) {
    log.error({ err: error, leadId }, "falha ao tentar responder dúvida durante ociosidade do vendedor");
  }
}

/**
 * Mensagem nova do CLIENTE enquanto o lead está em atendimento humano:
 * encaminha pro WhatsApp do vendedor dono do atendimento, com o nome na
 * frente pra ele saber de quem é sem abrir o painel.
 *
 * Pode falhar fora da janela de 24h da Meta (o vendedor precisa ter falado
 * com o bot nas últimas 24h) — nesse caso fica só o e-mail de aviso, que já
 * era o comportamento anterior. Por isso esta função nunca propaga erro.
 */
export async function encaminharMensagemDoClienteParaVendedor(params: {
  leadId: string;
  whatsappCliente: string;
  nomeCliente: string | null;
  mensagem: string;
  log: Logger;
}): Promise<void> {
  const { leadId, whatsappCliente, nomeCliente, mensagem, log } = params;

  try {
    // Preferência: o vendedor que já é dono do atendimento no relay. Fallback
    // (handoff anterior a esta funcionalidade): resolve pela unidade, como a
    // notificação de handoff faz — e abre o atendimento de uma vez.
    let numeroVendedor = await getVendedorDoLead(leadId);
    if (!numeroVendedor) {
      const config = await obterConfig();
      const unidade = (await buscarUnidadeEfetivaDoLead(leadId))?.unidade ?? null;
      numeroVendedor = determinarNumeroVendedor(unidade, config.vendedor);
      await abrirAtendimento(numeroVendedor, leadId);
    }

    // Cliente escreveu de novo enquanto esperava: relógio de ociosidade
    // reinicia a partir desta mensagem, independente do encaminhamento abaixo
    // dar certo ou não (o cliente está esperando de qualquer forma).
    try {
      await agendarChecagemOciosidade(leadId, numeroVendedor);
    } catch (error) {
      log.error({ err: error, leadId }, "falha ao agendar checagem de ociosidade do vendedor");
    }

    // Se o vendedor já está ocioso o bastante pra ter disparado o aviso, dá
    // pra tentar quebrar mais esse galho sozinho (até 3x) antes do vendedor
    // aparecer — sempre com o encaminhamento abaixo acontecendo do mesmo jeito.
    const atendimentoAtual = await buscarAtendimento(numeroVendedor, leadId);
    if (atendimentoAtual) {
      await tentarResponderDuvidaEmEspera(leadId, whatsappCliente, nomeCliente, mensagem, atendimentoAtual, log);
    }

    const atendimentos = await listarAtendimentosAbertos(numeroVendedor);
    const posicao = atendimentos.findIndex((a) => a.leadId === leadId);
    const esteSelecionado = posicao >= 0 && atendimentos[posicao].selecionado;

    const rotulo = nomeCliente ? `${nomeCliente} (${whatsappCliente})` : whatsappCliente;
    const aviso = esteSelecionado
      ? "Responda aqui que eu repasso."
      : `Esse NÃO é o cliente selecionado — responda *#${posicao + 1}* antes, senão sua resposta vai pra outra pessoa.`;

    const corpo = `💬 *${rotulo}*:\n${mensagem}\n\n_${aviso}_`;

    try {
      await sendWhatsAppMessage(`+${normalizarNumero(numeroVendedor)}`, corpo);
      await registrarMensagemRelay({
        leadId,
        numeroVendedor,
        direcao: "cliente_para_vendedor",
        texto: mensagem,
        entregue: true,
      });
      log.info({ leadId }, "mensagem do cliente encaminhada ao vendedor via relay");
    } catch (error) {
      await registrarMensagemRelay({
        leadId,
        numeroVendedor,
        direcao: "cliente_para_vendedor",
        texto: mensagem,
        entregue: false,
        erro: String(error),
      });
      log.error(
        { err: error, leadId },
        "falha ao encaminhar mensagem do cliente ao vendedor — provável janela de 24h fechada; o e-mail de aviso segue valendo"
      );
    }
  } catch (error) {
    log.error({ err: error, leadId }, "falha inesperada no encaminhamento do relay");
  }
}
