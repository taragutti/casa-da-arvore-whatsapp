import { Queue } from "bullmq";
import { connection } from "./connection";

export const VENDOR_IDLE_QUEUE_NAME = "vendor-idle-check";

export interface VendorIdleJobData {
  leadId: string;
  numeroVendedor: string;
  /** ISO — momento em que o cliente passou a esperar resposta (abertura do handoff ou mensagem nova dele). */
  esperandoDesde: string;
}

export const vendorIdleQueue = new Queue<VendorIdleJobData>(VENDOR_IDLE_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});
