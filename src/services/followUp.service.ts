import { logger } from "../config/logger";
import { followUpQueue, ReguaFollowUp } from "../queue/followUpQueue";
import { getUltimaInteracao } from "../repositories/leads.repo";
import { getEstadoHandoff } from "../repositories/conversationState.repo";
import { dentroDoHorarioComercial } from "./handoff.service";
import { sendWhatsAppMessage } from "./whatsapp.service";

const DELAY_MS: Record<ReguaFollowUp, number> = {
  "2h": 2 * 60 * 60 * 1000,
  "48h": 48 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/** 30d se repete enquanto o lead ficar frio — nutrição passiva (Seção 6), não é etapa final. */
const PROXIMA_REGUA: Record<ReguaFollowUp, ReguaFollowUp> = {
  "2h": "48h",
  "48h": "7d",
  "7d": "30d",
  "30d": "30d",
};

/**
 * Textos de follow-up: a Seção 6 define os GATILHOS (quando disparar), mas
 * não o texto exato das mensagens — diferente da confirmação automática
 * (essa sim veio pronta da especificação original). Revisar/ajustar o tom
 * antes de confiar cegamente nisso em produção.
 */
const MENSAGENS_FOLLOW_UP: Record<ReguaFollowUp, string> = {
  "2h": "Oi! Vi que te mandei algumas informações mais cedo — ficou alguma dúvida? Fico à disposição pra ajudar no que precisar! 🌳",
  "48h":
    "Oi! Passando aqui de novo — se ainda tiver interesse no seu evento, é só me chamar que te ajudo com os próximos passos. 🌳",
  "7d": "Oi! Faz um tempinho que a gente não conversa — se ainda estiver pensando no seu evento, seguimos à disposição. Qualquer coisa é só chamar! 🌳",
  "30d":
    "Oi! Passando pra lembrar que estamos por aqui — se quiser saber sobre novidades e datas disponíveis pra seu evento, é só responder essa mensagem. 🌳",
};

/** Agenda a primeira régua (2h) logo após o envio de mídia/catálogo (Seção 6). Chamado por mediaEngine.service.ts. */
export async function agendarFollowUp(leadId: string, whatsappNumber: string, regua: ReguaFollowUp = "2h"): Promise<void> {
  await followUpQueue.add(
    "follow-up",
    { leadId, whatsappNumber, regua, agendadoEm: new Date().toISOString() },
    { delay: DELAY_MS[regua] }
  );
}

/**
 * Processa uma régua agendada. Cancela silenciosamente (sem reagendar) se o
 * lead respondeu depois do agendamento ou se já está em atendimento humano
 * (Seção 5) — nesses casos o bot não deve falar sozinho. Fora do horário
 * comercial, reagenda a MESMA régua pra daqui a 1h em vez de pular.
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

  if (!dentroDoHorarioComercial()) {
    log.debug("fora do horário comercial — reagendando a mesma régua pra daqui a 1h");
    await followUpQueue.add("follow-up", { leadId, whatsappNumber, regua, agendadoEm }, { delay: 60 * 60 * 1000 });
    return;
  }

  try {
    await sendWhatsAppMessage(whatsappNumber, MENSAGENS_FOLLOW_UP[regua]);
    log.info("mensagem de follow-up enviada");
  } catch (error) {
    log.error({ err: error }, "falha ao enviar mensagem de follow-up");
  }

  const proximaRegua = PROXIMA_REGUA[regua];
  await followUpQueue.add(
    "follow-up",
    { leadId, whatsappNumber, regua: proximaRegua, agendadoEm: new Date().toISOString() },
    { delay: DELAY_MS[proximaRegua] }
  );
}
