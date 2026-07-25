/**
 * Roda o job do briefing mensal manualmente, sem esperar o cron
 * (critério de aceite da Etapa 7).
 *
 * Uso:
 *   npm run briefing                # processa o mês anterior ao atual
 *   npm run briefing -- 2026-07     # processa um mês específico (formato AAAA-MM)
 */
import { runMonthlyBriefingJob } from "../src/jobs/monthlyBriefing.cron";

const periodoArg = process.argv[2];

runMonthlyBriefingJob(periodoArg)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Falha ao rodar o briefing:", error);
    process.exit(1);
  });
