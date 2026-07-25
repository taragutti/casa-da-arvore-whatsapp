import { env } from "../config/env";
import { logger } from "../config/logger";

/**
 * Envia uma mensagem de texto via WhatsApp Business Cloud API (Meta).
 * Usado só no caminho do número de teste (routes/whatsapp.ts) — a automação
 * de produção existente já cuida das respostas por conta própria.
 */
export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    logger.warn("WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID não configurados — pulando envio de resposta.");
    return;
  }

  const url = `https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const numeroLimpo = to.replace(/^\+/, "");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: numeroLimpo,
      type: "text",
      text: { body },
    }),
  });

  if (!response.ok) {
    const detalhe = await response.text();
    throw new Error(`Falha ao enviar mensagem via WhatsApp (${response.status}): ${detalhe}`);
  }
}

/**
 * Monta a mensagem de confirmação (seção 7 da especificação), com fallback
 * genérico quando nome_cliente ou tipo_evento vierem nulos da extração.
 */
export function montarMensagemConfirmacao(nomeCliente: string | null, tipoEvento: string | null): string {
  const saudacao = nomeCliente ? `Oi, ${nomeCliente}!` : "Oi, tudo bem?";
  const assunto = tipoEvento ? `sobre ${tipoEvento.replace(/_/g, " ")}` : "sua mensagem";

  return (
    `${saudacao} Recebemos ${assunto} e já estamos organizando as informações. ` +
    `Em breve alguém da nossa equipe retorna com todos os detalhes. Enquanto isso, ` +
    `fica à vontade pra mandar mais informações (data, número de convidados, ideias que você já tem)! 🌳`
  );
}
