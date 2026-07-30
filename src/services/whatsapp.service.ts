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

type TipoMidiaWhatsApp = "image" | "video" | "document";

/** Envia mídia por link (foto/vídeo/documento) — motor de mídia progressiva (Seção 4). */
async function sendWhatsAppMedia(
  to: string,
  tipo: TipoMidiaWhatsApp,
  url: string,
  opts: { caption?: string; filename?: string } = {}
): Promise<void> {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    logger.warn("WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID não configurados — pulando envio de mídia.");
    return;
  }

  const url_ = `https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const numeroLimpo = to.replace(/^\+/, "");

  const mediaPayload: Record<string, string> = { link: url };
  if (opts.caption) mediaPayload.caption = opts.caption;
  if (tipo === "document" && opts.filename) mediaPayload.filename = opts.filename;

  const response = await fetch(url_, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: numeroLimpo,
      type: tipo,
      [tipo]: mediaPayload,
    }),
  });

  if (!response.ok) {
    const detalhe = await response.text();
    throw new Error(`Falha ao enviar ${tipo} via WhatsApp (${response.status}): ${detalhe}`);
  }
}

export async function sendWhatsAppImage(to: string, url: string, caption?: string): Promise<void> {
  return sendWhatsAppMedia(to, "image", url, { caption });
}

export async function sendWhatsAppVideo(to: string, url: string, caption?: string): Promise<void> {
  return sendWhatsAppMedia(to, "video", url, { caption });
}

export async function sendWhatsAppDocument(to: string, url: string, filename: string, caption?: string): Promise<void> {
  return sendWhatsAppMedia(to, "document", url, { caption, filename });
}

export interface ResumoLeadParaVendedor {
  whatsappCliente: string;
  nomeCliente: string | null;
  email: string | null;
  ramo: string | null;
  unidadeRecomendada: string | null;
  dataEvento: string | null;
  numeroConvidados: number | null;
  orcamentoMencionado: number | null;
  resumoPedido: string;
  objecaoOuDuvida: string | null;
  gatilho: string;
  paraGerente: boolean;
  slaMinutos: number;
  dentroDoHorarioComercial: boolean;
  mensagemOriginal: string;
  dadosRamo: Record<string, unknown>;
}

function formatarLabel(valor: string): string {
  return valor.replace(/_/g, " ");
}

/** Monta o resumo que o vendedor humano recebe no handoff (Seção 5) — "primeiras impressões" da IA em texto corrido. */
export function montarResumoParaVendedor(r: ResumoLeadParaVendedor): string {
  const linhas: string[] = [];

  linhas.push(r.paraGerente ? "🚨 *ATENÇÃO — GERENTE*" : "🔔 *Novo lead pra atender*");
  linhas.push("");
  linhas.push(`*Motivo:* ${formatarLabel(r.gatilho)}`);
  linhas.push(
    r.dentroDoHorarioComercial
      ? `*Prazo:* responder em até ${r.slaMinutos} min`
      : "*Prazo:* fora do horário comercial — responder na primeira hora do próximo dia útil"
  );
  linhas.push("");
  linhas.push(`*Cliente:* ${r.nomeCliente ?? "não informado"}`);
  linhas.push(`*WhatsApp:* ${r.whatsappCliente}`);
  if (r.email) linhas.push(`*E-mail:* ${r.email}`);
  linhas.push("");

  if (r.ramo) linhas.push(`*Tipo de evento:* ${formatarLabel(r.ramo)}`);
  if (r.unidadeRecomendada) linhas.push(`*Unidade sugerida:* ${formatarLabel(r.unidadeRecomendada)}`);
  if (r.dataEvento) linhas.push(`*Data desejada:* ${r.dataEvento}`);
  if (r.numeroConvidados != null) linhas.push(`*Convidados:* ${r.numeroConvidados}`);
  if (r.orcamentoMencionado != null) {
    linhas.push(`*Orçamento mencionado:* R$ ${r.orcamentoMencionado.toLocaleString("pt-BR")}`);
  }

  const detalhes = Object.entries(r.dadosRamo).filter(
    ([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0)
  );
  if (detalhes.length > 0) {
    linhas.push("");
    linhas.push("*Detalhes coletados:*");
    for (const [chave, valor] of detalhes) {
      const texto = Array.isArray(valor)
        ? valor.map(String).join(", ")
        : typeof valor === "boolean"
          ? valor
            ? "sim"
            : "não"
          : String(valor);
      linhas.push(`• ${formatarLabel(chave)}: ${texto}`);
    }
  }

  if (r.resumoPedido) {
    linhas.push("");
    linhas.push(`*Resumo:* ${r.resumoPedido}`);
  }
  if (r.objecaoOuDuvida) {
    linhas.push(`*Objeção/dúvida:* ${r.objecaoOuDuvida}`);
  }

  linhas.push("");
  linhas.push(`*Última mensagem do cliente:*`);
  linhas.push(`"${r.mensagemOriginal}"`);

  return linhas.join("\n");
}

/**
 * Notifica o vendedor no WhatsApp sobre um lead em handoff (Seção 5). Não
 * lança em caso de falha — a notificação por e-mail é o canal confiável, e
 * este envio pode ser rejeitado pela Meta se a janela de 24h estiver fechada
 * (ver comentário em VENDEDOR_WHATSAPP_NUMBER, config/env.ts).
 */
export async function notificarVendedor(resumo: ResumoLeadParaVendedor): Promise<void> {
  if (!env.VENDEDOR_WHATSAPP_NUMBER) {
    logger.warn("VENDEDOR_WHATSAPP_NUMBER não configurado — handoff notificado só por e-mail.");
    return;
  }

  await sendWhatsAppMessage(env.VENDEDOR_WHATSAPP_NUMBER, montarResumoParaVendedor(resumo));
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
