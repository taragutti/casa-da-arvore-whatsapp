import { Router, Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { messageQueue } from "../queue/messageQueue";

export const ingestRouter = Router();

const ingestSchema = z.object({
  whatsapp_number: z.string().min(8, "whatsapp_number é obrigatório"),
  mensagem: z.string().min(1, "mensagem é obrigatória"),
  timestamp: z.string().datetime().optional(),
});

function apiKeyGuard(req: Request, res: Response, next: () => void) {
  const key = req.header("x-api-key");
  if (key !== env.INGEST_API_KEY) {
    res.status(401).json({ error: "API key inválida ou ausente." });
    return;
  }
  next();
}

/**
 * POST /api/leads/ingest
 *
 * Endpoint genérico usado pela automação já existente (Make / ecossistema
 * WhatsApp em produção) — ela chama este endpoint a cada mensagem relevante,
 * enviando a API key no header "x-api-key".
 *
 * A partir da Etapa 5, isto só valida e enfileira (BullMQ/Redis) — quem faz a
 * extração via IA e a gravação no banco é o worker, fora do caminho da
 * requisição HTTP. Por isso a resposta não traz mais os dados extraídos: o
 * processamento acontece em segundo plano, alguns instantes depois.
 */
ingestRouter.post("/api/leads/ingest", apiKeyGuard, async (req: Request, res: Response) => {
  const parseResult = ingestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.flatten().fieldErrors });
    return;
  }

  const { whatsapp_number, mensagem } = parseResult.data;

  const job = await messageQueue.add("processar-mensagem", {
    whatsappNumber: whatsapp_number,
    mensagem,
    payloadBruto: req.body,
    origem: "generico",
  });

  res.status(202).json({ status: "enfileirado", job_id: job.id });
});
