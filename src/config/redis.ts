import IORedis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

/**
 * Conexão Redis de uso geral da aplicação (hoje: sessões).
 *
 * Separada de propósito da conexão em `queue/connection.ts`: aquela é entregue
 * ao BullMQ, que usa comandos blocking (BRPOPLPUSH) e duplica a conexão por
 * conta própria. Compartilhar o mesmo cliente entre a fila e as sessões é uma
 * forma conhecida de causar interferência difícil de diagnosticar.
 */
export const redisApp = new IORedis(env.REDIS_URL);

redisApp.on("error", (err) => {
  logger.error({ err }, "erro na conexão Redis da aplicação (sessões)");
});
