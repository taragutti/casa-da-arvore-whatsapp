import pino from "pino";
import { env } from "./env";

const isProduction = env.NODE_ENV === "production";

/**
 * Logger estruturado (Etapa 8). Em produção sai como JSON (uma linha por
 * evento, fácil de filtrar em qualquer plataforma de hospedagem). Em
 * desenvolvimento sai formatado e colorido, mais fácil de ler no terminal.
 *
 * Uso típico: crie um logger "filho" com um id de rastreio e passe-o adiante
 * pelas funções do pipeline, ex:
 *   const log = logger.child({ rawMessageId });
 *   log.info("mensagem recebida");
 *   ...
 * Assim dá pra filtrar todos os eventos de UMA mensagem específica, do
 * recebimento até a resposta (critério de aceite da Etapa 8).
 */
export const logger = pino({
  level: isProduction ? "info" : "debug",
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
      },
});
