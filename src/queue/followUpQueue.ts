import { Queue } from "bullmq";
import { connection } from "./connection";

export const FOLLOW_UP_QUEUE_NAME = "lead-follow-up";

export type ReguaFollowUp = "2h" | "48h" | "7d" | "30d";

export interface FollowUpJobData {
  leadId: string;
  whatsappNumber: string;
  regua: ReguaFollowUp;
  /** ISO — timestamp de quando ESTA régua foi agendada, usado pra detectar se o lead respondeu depois (Seção 6). */
  agendadoEm: string;
}

export const followUpQueue = new Queue<FollowUpJobData>(FOLLOW_UP_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});
