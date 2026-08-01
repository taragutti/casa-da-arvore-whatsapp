import { Logger } from "pino";
import { logger } from "../config/logger";
import { ExtractedLeadData } from "./anthropic.service";
import { UnidadeRecomendada } from "./routing.service";
import { sendWhatsAppMessage } from "./whatsapp.service";
import { enviarMaterialDaUnidade } from "./mediaEngine.service";
import { obterEstadoScript, salvarEstadoScript } from "../repositories/scriptState.repo";
import { obterConfig } from "./config.service";
import { dentroDoHorarioComercial } from "./handoff.service";
import { notificarHandoff } from "./messageProcessing.service";
import { nomeDaUnidade, passoDoScript } from "./scriptEngine.service";

/**
 * Executor do script guiado: pega as ações que o motor decidiu e as realiza.
 *
 * Toda a decisão fica no scriptEngine (puro, testado); aqui só há efeito
 * colateral — mandar mensagem, mandar material, avisar vendedor, salvar
 * estado. É por isso que este arquivo quase não tem `if` de regra de negócio:
 * qualquer condicional que apareça aqui provavelmente é decisão de fluxo no
 * lugar errado.
 */

/**
 * Pausa entre mensagens do mesmo bloco. O documento pede blocos curtos em
 * sequência; disparar três mensagens no mesmo milissegundo chega fora de ordem
 * no aparelho com frequência — a Meta não garante ordenação de envios
 * simultâneos para o mesmo destinatário.
 */
const PAUSA_ENTRE_MENSAGENS_MS = 900;

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Texto do cupom (N4E). Autoral: o documento pede a oferta mas não define
 * código nem valor de desconto — isso precisa vir da gestão antes de valer
 * como promessa comercial.
 */
const CUPOM_RECREACAO =
  "Que ótimo! 🎁 Vou pedir para nosso consultor te enviar o cupom exclusivo de desconto para a primeira festa fechada. Ele fala com você por aqui mesmo!";

export interface ParametrosScript {
  whatsappNumber: string;
  mensagem: string;
  leadId: string;
  extracted: ExtractedLeadData;
  unidadeRecomendada: UnidadeRecomendada | null;
  log: Logger;
}

/**
 * Campos que a IA extraiu e que o script usa para interpolar as mensagens
 * seguintes ("Que fofo, Ana!"). Só nomes: o script pergunta em texto livre e
 * quem estrutura é a extração que já existe.
 */
function camposParaInterpolar(
  extracted: ExtractedLeadData,
  unidade: UnidadeRecomendada | null
): Record<string, string> {
  const dados = extracted.dados_ramo;
  const campos: Record<string, string | null> = {
    nome_aniversariante: dados.nome_aniversariante,
    nome_debutante: dados.nome_debutante,
    nomes_noivos: dados.nomes_noivos,
    nome_empresa: dados.nome_empresa,
    nome_cliente: extracted.nome_cliente,
    unidade_nome: nomeDaUnidade(unidade) ?? null,
  };

  return Object.fromEntries(Object.entries(campos).filter(([, v]) => v)) as Record<string, string>;
}

export async function executarPassoDoScript(params: ParametrosScript): Promise<void> {
  const { whatsappNumber, mensagem, leadId, extracted, log } = params;

  const estadoAnterior = await obterEstadoScript(whatsappNumber);
  const config = await obterConfig();

  const resultado = passoDoScript(mensagem, estadoAnterior, {
    dentroDoHorarioComercial: dentroDoHorarioComercial(new Date(), config.horario),
    extraidos: camposParaInterpolar(extracted, params.unidadeRecomendada),
    regrasHandoff: config.handoff,
  });

  const unidade = resultado.unidadeDecidida ?? params.unidadeRecomendada;

  // Salva ANTES de executar: se o envio de uma mensagem falhar no meio, o
  // cliente perde uma mensagem, o que é ruim — mas se o estado não tivesse
  // avançado, a próxima mensagem dele repetiria o mesmo nó e ele receberia a
  // pergunta duas vezes, o que é pior e se repete indefinidamente.
  await salvarEstadoScript(whatsappNumber, resultado.estado);

  for (const [indice, acao] of resultado.acoes.entries()) {
    try {
      switch (acao.tipo) {
        case "enviar_texto":
          await sendWhatsAppMessage(whatsappNumber, acao.texto);
          break;

        case "enviar_material": {
          const { enviadas, semMidia } = await enviarMaterialDaUnidade(
            whatsappNumber,
            acao.unidade,
            extracted.ramo,
            extracted.dados_ramo,
            extracted.numero_convidados
          );
          log.info({ unidade: acao.unidade, enviadas, semMidia }, "material do script enviado");
          break;
        }

        case "checar_agenda":
          // N8A depende de integração com Google Calendar, que ainda não
          // existe. O próprio documento prevê este caso ("se o cliente não
          // informou data, pular a verificação e seguir para N9"), então
          // seguir em silêncio é o comportamento previsto — e não inventar
          // "sua data está livre" é o ponto: confirmar disponibilidade que
          // ninguém checou seria pior do que não falar nada.
          log.info({ unidade: acao.unidade }, "consulta de agenda pulada — integração de calendário não configurada");
          break;

        case "enviar_cupom":
          await sendWhatsAppMessage(whatsappNumber, CUPOM_RECREACAO);
          break;

        case "handoff":
          await notificarHandoff({
            whatsappNumber,
            leadId,
            mensagem,
            extracted,
            unidadeRecomendada: unidade,
            gatilho: acao.motivo,
            paraGerente: acao.paraGerente,
            log,
          });
          break;
      }
    } catch (error) {
      // Uma ação que falha não pode derrubar as demais: se a foto não subiu, o
      // vendedor ainda precisa ser avisado.
      log.error({ err: error, acao: acao.tipo }, "falha ao executar ação do script");
    }

    const proxima = resultado.acoes[indice + 1];
    if (proxima?.tipo === "enviar_texto") await esperar(PAUSA_ENTRE_MENSAGENS_MS);
  }

  log.info(
    { noAnterior: estadoAnterior.noAtual, noAtual: resultado.estado.noAtual, acoes: resultado.acoes.length },
    "passo do script executado"
  );
}
