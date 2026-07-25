import { env } from "../config/env";
import { logger } from "../config/logger";
import { MonthlyBriefingContent } from "./briefing.service";

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

/**
 * Envia o briefing mensal por e-mail via Resend (seção 5.3 da especificação).
 * Se RESEND_API_KEY ou BRIEFING_RECIPIENT_EMAIL não estiverem configurados,
 * apenas avisa no log e não envia (não quebra o job).
 */
export async function sendBriefingEmail(briefing: MonthlyBriefingContent): Promise<void> {
  if (!env.RESEND_API_KEY || !env.BRIEFING_RECIPIENT_EMAIL) {
    logger.warn(
      "RESEND_API_KEY/BRIEFING_RECIPIENT_EMAIL não configurados — briefing salvo no banco, mas e-mail não foi enviado."
    );
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
      to: env.BRIEFING_RECIPIENT_EMAIL,
      subject: `Briefing de Conteúdo — ${briefing.periodo}`,
      html: formatarBriefingEmHtml(briefing),
    }),
  });

  if (!response.ok) {
    const detalhe = await response.text();
    throw new Error(`Falha ao enviar e-mail via Resend (${response.status}): ${detalhe}`);
  }
}
