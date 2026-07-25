import { Worker, Job } from "bullmq";
import { connection } from "./connection";
import { logger } from "../config/logger";
import { MESSAGE_QUEUE_NAME, MessageJobData } from "./messageQueue";
import { processIncomingMessage } from "../services/messageProcessing.service";
import { sendWhatsAppMessage, montarMensagemConfirmacao } from "../services/whatsapp.service";

/**
 * Worker que roda fora do caminho da requisição HTTP (Etapa 5): toda a parte
 * pesada — chamada à IA e gravação no banco — acontece aqui, não dentro do
 * handler do webhook/endpoint. Isso garante que a resposta HTTP não fique
 * presa esperando a extração terminar.
 */
export function startMessageWorker() {
  const worker = new Worker<MessageJobData>(
    MESSAGE_QUEUE_NAME,
    async (job: Job<MessageJobData>) => {
      const { whatsappNumber, mensagem, payloadBruto, origem } = job.data;
      const log = logger.child({ jobId: job.id, whatsappNumber, origem });

      log.debug("job retirado da fila — iniciando processamento");
      const result = await processIncomingMessage(whatsappNumber, mensagem, payloadBruto);

      if (origem === "whatsapp_teste" && result.status === "processado") {
        const confirmacao = montarMensagemConfirmacao(
          result.dadosExtraidos.nome_cliente,
          result.dadosExtraidos.tipo_evento
        );
        try {
          await sendWhatsAppMessage(whatsappNumber, confirmacao);
          log.debug("confirmação automática enviada ao WhatsApp de teste");
        } catch (error) {
          log.error({ err: error }, "falha ao enviar confirmação automática");
        }
      }

      return result;
    },
    {
      connection,
      concurrency: 5, // processa até 5 mensagens ao mesmo tempo
    }
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, whatsappNumber: job.data.whatsappNumber }, "job da fila concluído");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "job da fila falhou após as tentativas");
  });

  return worker;
}
