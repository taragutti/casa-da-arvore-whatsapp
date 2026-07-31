import express from "express";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { checkDbConnection } from "./db/client";
import { connection as redisConnection } from "./queue/connection";
import { startMessageWorker } from "./queue/processMessage.job";
import { startFollowUpWorker } from "./queue/followUp.job";
import { scheduleMonthlyBriefingJob } from "./jobs/monthlyBriefing.cron";
import { scheduleLifecycleFollowUpJob } from "./jobs/lifecycleFollowUp.cron";
import { ingestRouter } from "./routes/ingest";
import { whatsappRouter } from "./routes/whatsapp";
import { painelRouter } from "./routes/painel";
import { leadsApiRouter } from "./routes/leadsApi";
import { midiasApiRouter } from "./routes/midiasApi";
import { midiaPublicaRouter } from "./routes/midiaPublica";
import { authRouter } from "./routes/auth";
import { garantirDiretorio, diretorioBase } from "./services/mediaStorage.service";
import { tratarErros } from "./middleware/asyncHandler";
import { configApiRouter } from "./routes/configApi";

const app = express();
// Guarda o corpo bruto da requisição (necessário para validar a assinatura
// X-Hub-Signature-256 do webhook do WhatsApp em routes/whatsapp.ts).
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);
// Formulário de login (POST /login) envia application/x-www-form-urlencoded,
// não JSON — sem isto req.body chegaria vazio e o login sempre falharia.
app.use(express.urlencoded({ extended: false }));

// Log de toda requisição HTTP (Etapa 8) — primeiro evento no rastro de
// qualquer mensagem que chega pelo endpoint genérico ou pelo webhook.
app.use((req, res, next) => {
  const inicio = Date.now();
  res.on("finish", () => {
    logger.info(
      { method: req.method, path: req.path, status: res.statusCode, duracaoMs: Date.now() - inicio },
      "requisição HTTP concluída"
    );
  });
  next();
});

app.get("/health", async (_req, res) => {
  try {
    await checkDbConnection();
    const redisOk = redisConnection.status === "ready";
    res.status(redisOk ? 200 : 503).json({ status: "ok", db: "conectado", redis: redisConnection.status });
  } catch (error) {
    res.status(503).json({ status: "erro", db: "desconectado", detalhe: String(error) });
  }
});

app.use(ingestRouter);
app.use(whatsappRouter);
app.use(authRouter);
app.use(painelRouter);
app.use(leadsApiRouter);
app.use(configApiRouter);
app.use(midiasApiRouter);
// Rota pública (sem autenticação) — é por ela que os servidores da Meta baixam
// o arquivo para entregar ao cliente. Ver comentário em routes/midiaPublica.ts.
app.use(midiaPublicaRouter);

// Precisa vir DEPOIS de todas as rotas: o Express só chama o tratador de erros
// que estiver registrado no fim da cadeia.
app.use(tratarErros);

/**
 * Rede de segurança do processo. O padrão do Node para Promise rejeitada sem
 * tratamento é ENCERRAR — e aqui o processo hospeda os workers da fila e os
 * jobs agendados, então morrer por causa de uma falha isolada derruba o
 * processamento de mensagens em andamento junto.
 *
 * Registrar e seguir é a escolha certa neste caso: o middleware `comErro` já
 * cobre o caminho HTTP, então o que chega aqui é falha fora dele, e perder o
 * servidor inteiro é sempre pior que perder aquela operação.
 */
process.on("unhandledRejection", (motivo) => {
  logger.error({ err: motivo }, "Promise rejeitada sem tratamento — processo mantido de pé");
});

process.on("uncaughtException", (erro) => {
  logger.fatal({ err: erro }, "exceção não capturada");
});

async function start() {
  try {
    await checkDbConnection();
    logger.info("conectado ao Postgres com sucesso");
  } catch (error) {
    logger.error({ err: error }, "falha ao conectar no Postgres");
    process.exit(1);
  }

  // Cria o diretório de mídia antes de aceitar requisição: se o volume não
  // estiver montado, é melhor descobrir no boot (com o caminho no log) do que
  // no primeiro upload. Falhar aqui não derruba o servidor — o resto do
  // sistema funciona sem biblioteca de mídia.
  try {
    await garantirDiretorio();
    logger.info({ diretorio: diretorioBase() }, "diretório de mídia pronto");
  } catch (error) {
    logger.error(
      { err: error, diretorio: diretorioBase() },
      "não foi possível preparar o diretório de mídia — uploads vão falhar até corrigir MEDIA_STORAGE_DIR"
    );
  }

  // Sobe o worker da fila (Etapa 5) no mesmo processo do servidor — simples
  // o bastante pra este estágio do projeto; pode virar um processo separado
  // depois, se o volume de mensagens justificar.
  startMessageWorker();
  logger.info("worker da fila de mensagens iniciado");

  startFollowUpWorker();
  logger.info("worker da fila de follow-up iniciado");

  scheduleMonthlyBriefingJob();
  scheduleLifecycleFollowUpJob();

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, `servidor rodando em http://localhost:${env.PORT}`);
  });
}

start();
