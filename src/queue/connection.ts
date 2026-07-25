import IORedis from "ioredis";
import { env } from "../config/env";
import { logger } from "../config/logger";

// BullMQ exige maxRetriesPerRequest: null na conexão usada pelos Workers.
export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

connection.on("error", (err) => {
  logger.error({ err }, "erro na conexão com o Redis");
});
