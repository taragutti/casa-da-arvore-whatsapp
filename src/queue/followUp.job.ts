import { Worker, Job } from "bullmq";
import { connection } from "./connection";
import { logger } from "../config/logger";
import { FOLLOW_UP_QUEUE_NAME, FollowUpJobData } from "./followUpQueue";
import { processarFollowUpAgendado } from "../services/followUp.service";

/** Worker da régua de silêncio (Seção 6) — roda os jobs atrasados agendados por followUp.service.ts. */
export function startFollowUpWorker() {
  const worker = new Worker<FollowUpJobData>(
    FOLLOW_UP_QUEUE_NAME,
    async (job: Job<FollowUpJobData>) => {
      const { leadId, whatsappNumber, regua, agendadoEm } = job.data;
      await processarFollowUpAgendado(leadId, whatsappNumber, regua, agendadoEm);
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "job de follow-up falhou após as tentativas");
  });

  return worker;
}
