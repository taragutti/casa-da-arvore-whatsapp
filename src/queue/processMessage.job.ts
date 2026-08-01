import { Worker, Job } from "bullmq";
import { connection } from "./connection";
import { logger } from "../config/logger";
import { MESSAGE_QUEUE_NAME, MessageJobData } from "./messageQueue";
import { processIncomingMessage } from "../services/messageProcessing.service";
import { sendWhatsAppMessage, montarMensagemConfirmacao } from "../services/whatsapp.service";
import { processarMidiaProgressiva, enviarMidiaDeEspera } from "../services/mediaEngine.service";
import { montarSaudacao } from "../services/saudacao.service";
import { executarPassoDoScript } from "../services/scriptRunner.service";
import { env } from "../config/env";

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

      // Com o script guiado ativo o pipeline muda em dois pontos: nenhuma
      // mensagem é descartada por falta de termo relevante (o cliente responde
      // "2" a um menu), e o handoff passa a ser decidido pelos nós do script em
      // vez da classificação da IA. Ver OpcoesProcessamento.
      const scriptAtivo = origem === "whatsapp_teste" && env.SCRIPT_FLUXO_ATIVO;
      const result = await processIncomingMessage(
        whatsappNumber,
        mensagem,
        payloadBruto,
        scriptAtivo ? { exigirRelevancia: false, detectarHandoffPorIa: false } : {}
      );

      if (scriptAtivo) {
        if (result.status === "processado") {
          if (result.handoff.emAtendimentoHumano) {
            // Regra 9.4: lead já entregue ao consultor não volta pro fluxo do
            // bot. O script fica mudo até alguém devolver a conversa no painel.
            log.debug("lead em atendimento humano — script não responde");
          } else {
            try {
              await executarPassoDoScript({
                whatsappNumber,
                mensagem,
                leadId: result.leadId,
                extracted: result.dadosExtraidos,
                unidadeRecomendada: result.unidadeRecomendada,
                log,
              });
            } catch (error) {
              log.error({ err: error }, "falha ao executar passo do script guiado");
            }
          }
        }

        return result;
      }

      // Primeiro contato sem termo relevante ("oi", "bom dia"): apresenta-se em
      // vez de ficar mudo. Só no webhook do WhatsApp — o endpoint genérico de
      // ingestão não tem conversa para responder.
      if (origem === "whatsapp_teste" && result.status === "ignorado" && result.saudar) {
        try {
          await sendWhatsAppMessage(whatsappNumber, montarSaudacao());
          log.info("saudação de primeiro contato enviada");
        } catch (error) {
          log.error({ err: error }, "falha ao enviar saudação de primeiro contato");
        }
      }

      if (origem === "whatsapp_teste" && result.status === "processado") {
        if (result.handoff.emAtendimentoHumano) {
          // Lead em atendimento humano (Seção 5): o bot não reinicia o fluxo
          // nem responde automaticamente — só o e-mail de notificação (já
          // disparado em processIncomingMessage) avisa o consultor.
          log.debug("lead em atendimento humano — bot não responde automaticamente");

          // Exceção: no momento EXATO em que o handoff dispara (gatilhoNovo),
          // manda a foto do espaço antes de silenciar. Sem isso o cliente que
          // perguntou preço fica olhando uma conversa sem resposta até o
          // vendedor aparecer — que pode demorar, ou ser no dia seguinte se for
          // fora do horário comercial.
          //
          // Só no gatilho novo: em lead JÁ em atendimento, cada mensagem cairia
          // aqui e o bot ficaria interrompendo a conversa do vendedor.
          if (result.handoff.gatilhoNovo) {
            try {
              await enviarMidiaDeEspera(
                whatsappNumber,
                result.leadId,
                result.dadosExtraidos.ramo,
                result.unidadeRecomendada,
                result.dadosExtraidos.dados_ramo,
                result.dadosExtraidos.numero_convidados
              );
            } catch (error) {
              log.error({ err: error }, "falha ao enviar mídia de espera no handoff");
            }
          }
        } else {
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

          try {
            await processarMidiaProgressiva(
              whatsappNumber,
              result.leadId,
              result.dadosExtraidos.ramo,
              result.unidadeRecomendada,
              result.dadosExtraidos.dados_ramo,
              result.dadosExtraidos.numero_convidados,
              result.dadosExtraidos.sinal_engajamento
            );
          } catch (error) {
            log.error({ err: error }, "falha no motor de mídia progressiva");
          }
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
