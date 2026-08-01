import { logger } from "../config/logger";
import { followUpQueue, ReguaFollowUp } from "../queue/followUpQueue";
import { getUltimaInteracao } from "../repositories/leads.repo";
import { getEstadoHandoff } from "../repositories/conversationState.repo";
import { dentroDoHorarioComercial } from "./handoff.service";
import { obterConfig } from "./config.service";
import { enviarComTemplateOuTexto, sendWhatsAppMessage } from "./whatsapp.service";
import { obterEstadoScript } from "../repositories/scriptState.repo";
import { obterNo } from "./scriptFluxo";
import { interpolar } from "./scriptEngine.service";

/**
 * Prazos vêm da configuração editável (estágio 8), não mais de constante. O
 * nome da régua ("2h", "48h"…) é só um rótulo estável usado como chave na fila
 * e no banco — se alguém configurar a régua "2h" para 4 horas, o rótulo continua
 * "2h" de propósito: mudá-lo invalidaria os jobs já agendados na fila, que
 * carregam o rótulo antigo no payload.
 */
async function atrasoMs(regua: ReguaFollowUp): Promise<number> {
  const { followUpMinutos } = await obterConfig();
  return followUpMinutos[regua] * 60 * 1000;
}

/** 30d se repete enquanto o lead ficar frio — nutrição passiva (Seção 6), não é etapa final. */
const PROXIMA_REGUA: Record<ReguaFollowUp, ReguaFollowUp> = {
  "2h": "48h",
  "48h": "7d",
  "7d": "30d",
  "30d": "30d",
};

/**
 * Nome do template aprovado na Meta por régua. Os templates são de texto puro
 * (sem variáveis), então o conteúdo tem que ser IDÊNTICO ao de
 * MENSAGENS_FOLLOW_UP abaixo — mudar um sem resubmeter o outro faz o cliente
 * receber um texto diferente do revisado.
 *
 * Follow-up é mensagem iniciada pela empresa: fora da janela de 24h só o
 * template é entregue, por isso ele vem primeiro e o texto livre é só fallback.
 */
const TEMPLATES_FOLLOW_UP: Record<ReguaFollowUp, string> = {
  "2h": "followup_2h",
  "48h": "followup_48h",
  "7d": "followup_7d",
  "30d": "followup_30d",
};

/**
 * Textos de follow-up: a Seção 6 define os GATILHOS (quando disparar), mas
 * não o texto exato das mensagens — diferente da confirmação automática
 * (essa sim veio pronta da especificação original). Revisar/ajustar o tom
 * antes de confiar cegamente nisso em produção.
 *
 * Usado como fallback quando o template correspondente não estiver aprovado.
 */
const MENSAGENS_FOLLOW_UP: Record<ReguaFollowUp, string> = {
  "2h": "Oi! Vi que te mandei algumas informações mais cedo — ficou alguma dúvida? Fico à disposição pra ajudar no que precisar! 🌳",
  "48h":
    "Oi! Passando aqui de novo — se ainda tiver interesse no seu evento, é só me chamar que te ajudo com os próximos passos. 🌳",
  "7d": "Oi! Faz um tempinho que a gente não conversa — se ainda estiver pensando no seu evento, seguimos à disposição. Qualquer coisa é só chamar! 🌳",
  "30d":
    "Oi! Passando pra lembrar que estamos por aqui — se quiser saber sobre novidades e datas disponíveis pra seu evento, é só responder essa mensagem. 🌳",
};

/**
 * Janela de atendimento da Meta: fora dela, texto livre não é entregue.
 * Só a régua de 2h cabe dentro dela com folga.
 */
const JANELA_SERVICO_MS = 24 * 60 * 60 * 1000;

/**
 * Convite para retomar de onde parou, quando o lead abandonou no MEIO da
 * qualificação do script.
 *
 * O texto padrão da régua de 2h fala do "material que te enviei" — mas quem
 * parou de responder no N4A nunca recebeu material nenhum, e receber essa
 * mensagem só evidencia que o bot não está acompanhando a conversa. Repetir a
 * pergunta pendente retoma exatamente onde ficou.
 *
 * Vai como texto livre de propósito: dentro da janela de 24h isso é conversa
 * de serviço — entrega sem depender de template aprovado, e sem custo de
 * conversa iniciada pela empresa.
 */
async function montarRetomadaDaPerguntaPendente(whatsappNumber: string): Promise<string[] | null> {
  const estado = await obterEstadoScript(whatsappNumber);
  if (!estado.noAtual) return null;

  const no = obterNo(estado.noAtual);
  if (!no) return null;
  if (no.tipo !== "pergunta_texto" && no.tipo !== "pergunta_menu" && no.tipo !== "cupom") return null;

  const perguntas = no.mensagens.map((m) => interpolar(m, estado.respostas).trim()).filter(Boolean);
  return perguntas.length > 0 ? perguntas : null;
}

const CONVITE_RETOMADA = "Oi! Ficou faltando só isso aqui pra eu te mostrar as melhores opções 😊";

/** Agenda a primeira régua (2h) logo após o envio de mídia/catálogo (Seção 6). Chamado por mediaEngine.service.ts. */
export async function agendarFollowUp(leadId: string, whatsappNumber: string, regua: ReguaFollowUp = "2h"): Promise<void> {
  await followUpQueue.add(
    "follow-up",
    { leadId, whatsappNumber, regua, agendadoEm: new Date().toISOString() },
    { delay: await atrasoMs(regua) }
  );
}

/**
 * Processa uma régua agendada. Cancela silenciosamente (sem reagendar) se o
 * lead respondeu depois do agendamento ou se já está em atendimento humano
 * (Seção 5) — nesses casos o bot não deve falar sozinho. Fora do horário
 * comercial, reagenda a MESMA régua (intervalo configurável) em vez de pular:
 * pular faria o lead perder aquele contato da régua para sempre.
 */
export async function processarFollowUpAgendado(
  leadId: string,
  whatsappNumber: string,
  regua: ReguaFollowUp,
  agendadoEm: string
): Promise<void> {
  const log = logger.child({ leadId, regua });

  const [ultimaInteracao, estadoHandoff] = await Promise.all([getUltimaInteracao(leadId), getEstadoHandoff(leadId)]);

  if (estadoHandoff.emAtendimentoHumano) {
    log.debug("lead em atendimento humano — follow-up cancelado");
    return;
  }

  if (ultimaInteracao != null && ultimaInteracao.getTime() > new Date(agendadoEm).getTime()) {
    log.debug("lead respondeu desde o agendamento — follow-up cancelado");
    return;
  }

  const config = await obterConfig();

  if (!dentroDoHorarioComercial(new Date(), config.horario)) {
    const minutos = config.reagendamentoForaHorarioMinutos;
    log.debug({ minutos }, "fora do horário comercial — reagendando a mesma régua");
    await followUpQueue.add(
      "follow-up",
      { leadId, whatsappNumber, regua, agendadoEm },
      { delay: minutos * 60 * 1000 }
    );
    return;
  }

  // Conversa parada no meio da qualificação: retomar a pergunta pendente vale
  // mais do que o texto genérico da régua. Só na 2h — nas demais a janela de
  // 24h já fechou e texto livre não seria entregue.
  const dentroDaJanela =
    ultimaInteracao != null && Date.now() - ultimaInteracao.getTime() < JANELA_SERVICO_MS;

  if (regua === "2h" && dentroDaJanela) {
    const retomada = await montarRetomadaDaPerguntaPendente(whatsappNumber);
    if (retomada) {
      try {
        await sendWhatsAppMessage(whatsappNumber, CONVITE_RETOMADA);
        for (const pergunta of retomada) await sendWhatsAppMessage(whatsappNumber, pergunta);
        log.info("retomada da qualificação enviada — conversa parada no meio do script");
      } catch (error) {
        log.error({ err: error }, "falha ao enviar retomada da qualificação");
      }

      const proxima = PROXIMA_REGUA[regua];
      await followUpQueue.add(
        "follow-up",
        { leadId, whatsappNumber, regua: proxima, agendadoEm: new Date().toISOString() },
        { delay: await atrasoMs(proxima) }
      );
      return;
    }
  }

  try {
    await enviarComTemplateOuTexto({
      to: whatsappNumber,
      templateName: TEMPLATES_FOLLOW_UP[regua],
      variaveis: [], // templates de follow-up são texto puro, sem variáveis
      textoFallback: MENSAGENS_FOLLOW_UP[regua],
      contexto: { leadId, regua },
    });
    log.info("mensagem de follow-up enviada");
  } catch (error) {
    log.error({ err: error }, "falha ao enviar mensagem de follow-up");
  }

  const proximaRegua = PROXIMA_REGUA[regua];
  await followUpQueue.add(
    "follow-up",
    { leadId, whatsappNumber, regua: proximaRegua, agendadoEm: new Date().toISOString() },
    { delay: await atrasoMs(proximaRegua) }
  );
}
