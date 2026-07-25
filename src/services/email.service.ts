import { env } from "../config/env";
import { logger } from "../config/logger";
import { MonthlyBriefingContent } from "./briefing.service";
import { GatilhoHandoff } from "./handoff.service";
import { RamoEvento } from "./anthropic.service";
import { UnidadeRecomendada } from "./routing.service";
import { escapeHtml } from "../utils/html";

/** Monta o HTML legível do briefing mensal (seção 6.3, passo 7). */
export function formatarBriefingEmHtml(briefing: MonthlyBriefingContent): string {
  const blocosPorTipo = briefing.por_tipo_evento
    .map(
      (item) => `
      <div style="margin-bottom: 24px; padding: 16px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h3 style="margin: 0 0 8px; color: #2f5233;">
          ${item.tipo_evento.replace(/_/g, " ")} — ${item.numero_registros} registro(s)
        </h3>
        <p><strong>Temas recorrentes:</strong> ${item.temas_recorrentes.join(", ") || "—"}</p>
        <p><strong>Objeções mais frequentes:</strong> ${item.objecoes_recorrentes.join(", ") || "—"}</p>
        <p><strong>Gatilho emocional dominante:</strong> ${item.gatilho_emocional_dominante ?? "—"}</p>
        <p><strong>Sugestões de pauta:</strong></p>
        <ul>${item.sugestoes_de_pauta.map((s) => `<li>${s}</li>`).join("")}</ul>
        <p><strong>Sugestões de anúncio:</strong></p>
        <ul>${item.sugestoes_de_anuncio.map((s) => `<li>${s}</li>`).join("")}</ul>
      </div>`
    )
    .join("\n");

  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <h2 style="color: #2f5233;">Briefing de Conteúdo e Tráfego Pago — ${briefing.periodo}</h2>
      <p style="font-size: 16px;"><strong>Insight geral do mês:</strong> ${briefing.insight_geral_do_mes || "—"}</p>
      ${blocosPorTipo || "<p>Nenhum sinal de demanda registrado neste período.</p>"}
      <p style="color: #888; font-size: 12px; margin-top: 32px;">
        Gerado automaticamente pelo sistema Casa da Árvore, a partir das conversas do WhatsApp.
      </p>
    </div>`;
}

/** Envia por Resend. Se RESEND_API_KEY não estiver configurada, só avisa no log e não envia (não quebra o chamador). */
async function enviarViaResend(params: { to: string; subject: string; html: string }): Promise<void> {
  if (!env.RESEND_API_KEY) {
    logger.warn("RESEND_API_KEY não configurada — e-mail não enviado.");
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Enquanto o domínio próprio não estiver verificado no Resend, este
      // remetente de teste funciona. Trocar depois de verificar o domínio
      // em resend.com/domains.
      from: "Casa da Árvore <onboarding@resend.dev>",
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!response.ok) {
    const detalhe = await response.text();
    throw new Error(`Falha ao enviar e-mail via Resend (${response.status}): ${detalhe}`);
  }
}

/** Envia o briefing mensal por e-mail via Resend (seção 5.3 da especificação). */
export async function sendBriefingEmail(briefing: MonthlyBriefingContent): Promise<void> {
  if (!env.BRIEFING_RECIPIENT_EMAIL) {
    logger.warn("BRIEFING_RECIPIENT_EMAIL não configurado — briefing salvo no banco, mas e-mail não foi enviado.");
    return;
  }

  await enviarViaResend({
    to: env.BRIEFING_RECIPIENT_EMAIL,
    subject: `Briefing de Conteúdo — ${briefing.periodo}`,
    html: formatarBriefingEmHtml(briefing),
  });
}

const GATILHO_LABELS: Record<GatilhoHandoff, string> = {
  reclamacao: "Reclamação / insatisfação",
  pedido_humano: "Pedido explícito de atendimento humano",
  pedido_contrato: "Pedido de fechamento / contrato",
  pedido_visita: "Pedido de visita",
  pergunta_valor: "Pergunta sobre valor final / desconto",
  falha_classificacao_repetida: "IA não conseguiu entender a mensagem (2+ vezes seguidas)",
};

export interface HandoffNotificationParams {
  whatsappNumber: string;
  nomeCliente: string | null;
  ramo: RamoEvento | null;
  unidadeRecomendada: UnidadeRecomendada | null;
  gatilho: GatilhoHandoff;
  paraGerente: boolean;
  slaMinutos: number;
  dentroDoHorarioComercial: boolean;
  resumoPedido: string;
  mensagemOriginal: string;
}

function destinatarioHandoff(): string | null {
  return env.HANDOFF_NOTIFICATION_EMAIL || env.BRIEFING_RECIPIENT_EMAIL || null;
}

/** Notifica um NOVO gatilho de handoff (Seção 5) — e-mail com contexto completo pro consultor/gerente decidir. */
export async function sendHandoffNotificationEmail(params: HandoffNotificationParams): Promise<void> {
  const destinatario = destinatarioHandoff();
  if (!destinatario) {
    logger.warn(
      "HANDOFF_NOTIFICATION_EMAIL/BRIEFING_RECIPIENT_EMAIL não configurados — handoff registrado no banco, mas e-mail não foi enviado."
    );
    return;
  }

  const prazo = params.dentroDoHorarioComercial
    ? `Responder em até ${params.slaMinutos} minutos (horário comercial).`
    : "Fora do horário comercial — responder na primeira hora do próximo dia útil.";

  const assunto = params.paraGerente
    ? `[URGENTE — GERENTE] Handoff: ${GATILHO_LABELS[params.gatilho]}`
    : `Handoff: ${GATILHO_LABELS[params.gatilho]}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <h2 style="color: ${params.paraGerente ? "#b00020" : "#2f5233"};">${escapeHtml(assunto)}</h2>
      <p><strong>Cliente:</strong> ${escapeHtml(params.nomeCliente ?? "não informado")} (${escapeHtml(params.whatsappNumber)})</p>
      <p><strong>Ramo:</strong> ${params.ramo ?? "não classificado"}</p>
      <p><strong>Unidade recomendada:</strong> ${params.unidadeRecomendada ?? "ainda não definida"}</p>
      <p><strong>Resumo do pedido:</strong> ${escapeHtml(params.resumoPedido || "—")}</p>
      <p><strong>Última mensagem:</strong> "${escapeHtml(params.mensagemOriginal)}"</p>
      <p style="color: #b00020;"><strong>Prazo de resposta:</strong> ${prazo}</p>
    </div>`;

  await enviarViaResend({ to: destinatario, subject: assunto, html });
}

/**
 * Notifica um novo contato de um lead que JÁ está em atendimento humano —
 * o bot não reinicia o fluxo nem responde automaticamente (Seção 5), só
 * avisa que chegou mensagem nova pra o consultor conferir.
 */
export async function sendHandoffFollowUpEmail(params: {
  whatsappNumber: string;
  nomeCliente: string | null;
  mensagemOriginal: string;
}): Promise<void> {
  const destinatario = destinatarioHandoff();
  if (!destinatario) {
    logger.warn(
      "HANDOFF_NOTIFICATION_EMAIL/BRIEFING_RECIPIENT_EMAIL não configurados — novo contato de lead em atendimento humano não notificado por e-mail."
    );
    return;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <h2 style="color: #2f5233;">Novo contato — lead já em atendimento humano</h2>
      <p><strong>Cliente:</strong> ${escapeHtml(params.nomeCliente ?? "não informado")} (${escapeHtml(params.whatsappNumber)})</p>
      <p><strong>Mensagem:</strong> "${escapeHtml(params.mensagemOriginal)}"</p>
      <p>O bot não respondeu automaticamente — esta conversa já está marcada como em atendimento humano.</p>
    </div>`;

  await enviarViaResend({
    to: destinatario,
    subject: `Novo contato: ${params.nomeCliente ?? params.whatsappNumber}`,
    html,
  });
}
