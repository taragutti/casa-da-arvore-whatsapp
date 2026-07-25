import cron from "node-cron";
import { logger } from "../config/logger";
import { findDemandSignalsBetween, saveMonthlyBriefing, markBriefingAsSent } from "../repositories/briefings.repo";
import { agruparPorTipoEvento, montarPayloadTexto, gerarBriefingMensal } from "../services/briefing.service";
import { sendBriefingEmail } from "../services/email.service";

interface PeriodoRange {
  periodo: string; // formato AAAA-MM
  inicio: Date;
  fim: Date; // exclusivo
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** AAAA-MM do mês anterior ao atual, com o intervalo de datas correspondente. */
function mesAnterior(referencia: Date = new Date()): PeriodoRange {
  const ano = referencia.getFullYear();
  const mes = referencia.getMonth(); // 0-indexado; mês anterior = mes - 1
  const inicio = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 1);
  const periodo = `${inicio.getFullYear()}-${pad2(inicio.getMonth() + 1)}`;
  return { periodo, inicio, fim };
}

/** Converte uma string "AAAA-MM" no intervalo de datas daquele mês inteiro. */
function periodoDeString(periodoStr: string): PeriodoRange {
  const [anoStr, mesStr] = periodoStr.split("-");
  const ano = Number(anoStr);
  const mes = Number(mesStr); // 1-indexado, como vem do usuário
  if (!ano || !mes || mes < 1 || mes > 12) {
    throw new Error(`Período inválido: "${periodoStr}". Use o formato AAAA-MM, ex: 2026-07.`);
  }
  const inicio = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 1);
  return { periodo: `${anoStr}-${pad2(mes)}`, inicio, fim };
}

/**
 * Roda o fluxo completo do briefing mensal (seção 6.3 da especificação):
 * busca os sinais de demanda do período, agrupa, gera via IA, salva no banco
 * e envia por e-mail. Sem argumento, processa o mês anterior ao atual (uso
 * normal do cron). Com `periodoOverride` (ex: "2026-07"), processa esse mês
 * específico — útil para rodar manualmente com dados de teste (critério de
 * aceite da Etapa 7).
 */
export async function runMonthlyBriefingJob(periodoOverride?: string): Promise<void> {
  const { periodo, inicio, fim } = periodoOverride ? periodoDeString(periodoOverride) : mesAnterior();
  const log = logger.child({ periodo });

  log.info("buscando sinais de demanda do período");
  const sinais = await findDemandSignalsBetween(inicio, fim);

  if (sinais.length === 0) {
    log.info("nenhum sinal de demanda encontrado — nada a gerar");
    return;
  }

  log.info({ totalSinais: sinais.length }, "sinais encontrados — agrupando por tipo de evento");
  const grupos = agruparPorTipoEvento(sinais);
  const payloadTexto = montarPayloadTexto(grupos);

  log.debug("gerando síntese via IA");
  const briefing = await gerarBriefingMensal(payloadTexto, periodo);

  const id = await saveMonthlyBriefing(periodo, briefing);
  log.info({ briefingId: id }, "briefing salvo — enviando e-mail");

  await sendBriefingEmail(briefing);
  await markBriefingAsSent(id);

  log.info("briefing mensal concluído");
}

/**
 * Agenda o job pra rodar todo dia 1 às 07:00, horário de Brasília
 * (seção 6.3, passo 1). Chamar uma vez na subida do servidor.
 */
export function scheduleMonthlyBriefingJob(): void {
  cron.schedule(
    "0 7 1 * *",
    () => {
      runMonthlyBriefingJob().catch((error) => {
        logger.error({ err: error }, "falha ao rodar o job mensal agendado");
      });
    },
    { timezone: "America/Sao_Paulo" }
  );
  logger.info("job mensal de briefing agendado (dia 1 às 07:00, horário de Brasília)");
}
