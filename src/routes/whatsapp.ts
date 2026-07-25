import crypto from "crypto";
import { Router, Request, Response } from "express";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { messageQueue } from "../queue/messageQueue";

export const whatsappRouter = Router();

interface WhatsAppMessage {
  from: string;
  type: string;
  text?: { body: string };
}

function isValidSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean {
  if (!rawBody || !signatureHeader || !env.WHATSAPP_APP_SECRET) return false;

  const expected =
    "sha256=" + crypto.createHmac("sha256", env.WHATSAPP_APP_SECRET).update(rawBody).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

/**
 * GET /webhooks/whatsapp — verificação exigida pela Meta na primeira
 * configuração do webhook (challenge/response).
 */
whatsappRouter.get("/webhooks/whatsapp", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

/**
 * POST /webhooks/whatsapp — recebimento de mensagens do número de teste
 * (seção 6.1 da especificação). Responde 200 imediatamente (a Meta exige
 * resposta em menos de 5s) e só enfileira (Etapa 5) — quem extrai via IA,
 * grava no banco e manda a confirmação de volta é o worker.
 */
whatsappRouter.post("/webhooks/whatsapp", async (req: Request, res: Response) => {
  const signature = req.header("x-hub-signature-256");
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  if (!isValidSignature(rawBody, signature)) {
    res.sendStatus(401);
    return;
  }

  res.sendStatus(200);

  try {
    const entries = req.body?.entry ?? [];
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "messages") continue;

        const messages: WhatsAppMessage[] = change.value?.messages ?? [];
        for (const message of messages) {
          if (message.type !== "text" || !message.text?.body) continue;

          const whatsappNumber = message.from.startsWith("+") ? message.from : `+${message.from}`;

          await messageQueue.add("processar-mensagem", {
            whatsappNumber,
            mensagem: message.text.body,
            payloadBruto: message,
            origem: "whatsapp_teste",
          });
        }
      }
    }
  } catch (error) {
    logger.error({ err: error }, "erro ao enfileirar mensagem do webhook do WhatsApp");
  }
});
