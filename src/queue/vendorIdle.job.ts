import { Worker, Job } from "bullmq";
import { connection } from "./connection";
import { logger } from "../config/logger";
import { VENDOR_IDLE_QUEUE_NAME, VendorIdleJobData } from "./vendorIdleQueue";
import { processarOciosidadeVendedor } from "../services/relay.service";

/** Worker do aviso de ociosidade do vendedor — roda os jobs agendados por relay.service.ts. */
export function startVendorIdleWorker() {
  const worker = new Worker<VendorIdleJobData>(
    VENDOR_IDLE_QUEUE_NAME,
    async (job: Job<VendorIdleJobData>) => {
      const { leadId, numeroVendedor, esperandoDesde } = job.data;
      await processarOciosidadeVendedor(leadId, numeroVendedor, esperandoDesde);
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "job de aviso de ociosidade do vendedor falhou após as tentativas");
  });

  return worker;
}
