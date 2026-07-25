import { Queue } from "bullmq";
import { connection } from "./connection";

export const MESSAGE_QUEUE_NAME = "message-processing";

export interface MessageJobData {
  whatsappNumber: string;
  mensagem: string;
  payloadBruto: unknown;
  // De onde veio a mensagem — decide se o worker manda confirmação automática
  // (só faz sentido no número de teste; a automação genérica já cuida disso
  // por conta própria).
  origem: "generico" | "whatsapp_teste";
}

export const messageQueue = new Queue<MessageJobData>(MESSAGE_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});
