import { logger } from "../config/logger";
import { DadosPorRamo, RamoEvento, SinalEngajamento } from "./anthropic.service";
import { UnidadeRecomendada } from "./routing.service";
import { sendWhatsAppImage, sendWhatsAppVideo, sendWhatsAppDocument } from "./whatsapp.service";
import { buscarMidias } from "../repositories/mediaLibrary.repo";
import { getEtapaMidiaAtual, registrarEnvioMidia } from "../repositories/conversationState.repo";

export type EtapaMidia = 1 | 2 | 3 | 4;

export type AcaoMidia =
  | { tipo: "enviar"; etapa: EtapaMidia }
  | { tipo: "aguardar_handoff" } // régua esgotada — Seção 5 (ainda não implementada) decide a notificação
  | { tipo: "nenhuma" };

/**
 * Decide a próxima ação da régua de mídia progressiva (Seção 4 do fluxo
 * detalhado). Só cobre o que a Seção 4 define — sinais que são gatilho de
 * handoff (Seção 5, ex.: pedido_visita) não avançam mídia aqui de propósito;
 * eles serão tratados quando a Seção 5 for implementada.
 */
export function decidirProximaAcaoMidia(
  ramo: RamoEvento | null,
  etapaAtual: number | null,
  sinal: SinalEngajamento
): AcaoMidia {
  // Exceção corporativo (Ramo D): etapa 1 mantida, etapa 2 opcional (pulada
  // aqui de propósito), etapas 3 e 4 comprimidas e enviadas juntas, sem
  // esperar sinal de engajamento.
  if (ramo === "corporativo") {
    if (etapaAtual == null) return { tipo: "enviar", etapa: 1 };
    if (etapaAtual < 4) return { tipo: "enviar", etapa: 4 };
    return { tipo: "aguardar_handoff" };
  }

  if (etapaAtual == null) {
    return { tipo: "enviar", etapa: 1 };
  }

  if (etapaAtual >= 4) {
    return { tipo: "aguardar_handoff" };
  }

  if (sinal === "pergunta_valor") {
    return { tipo: "enviar", etapa: 4 }; // pula direto pra etapa 4, independente da etapa atual
  }

  if (sinal === "positivo") {
    return { tipo: "enviar", etapa: (etapaAtual + 1) as EtapaMidia };
  }

  // negativo, neutro ou pedido_visita: não avança a régua de mídia.
  return { tipo: "nenhuma" };
}

/**
 * Heurística provisória de perfil de lead para curadoria de mídia (Seção 4 —
 * a "Estratégia de Envio de Mídias, Parte 4" que definiria os perfis reais
 * não está disponível nesta base). Ajustar assim que esse documento existir.
 */
function inferirPerfilLead(ramo: RamoEvento | null, dadosRamo: DadosPorRamo, numeroConvidados: number | null): string | null {
  if (ramo === "infantil") {
    return numeroConvidados != null && numeroConvidados > 100 ? "infantil_grande" : "infantil_pequeno";
  }
  if (ramo === "casamento") {
    return dadosRamo.origem_casal === "outra_cidade" || dadosRamo.origem_casal === "exterior" ? "destination" : null;
  }
  return null;
}

/** Envia a mídia da etapa; retorna false (sem lançar) se media_library não tiver nada ativo pra essa etapa/unidade. */
async function enviarEtapaMidia(
  whatsappNumber: string,
  unidade: UnidadeRecomendada,
  etapa: EtapaMidia,
  perfilLead: string | null
): Promise<boolean> {
  switch (etapa) {
    case 1: {
      const [foto] = await buscarMidias(unidade, "foto", "externa", null, 1);
      if (!foto) return false;
      await sendWhatsAppImage(whatsappNumber, foto.url);
      return true;
    }
    case 2: {
      const [video] = await buscarMidias(unidade, "video", "tour", null, 1);
      if (!video) return false;
      await sendWhatsAppVideo(whatsappNumber, video.url);
      return true;
    }
    case 3: {
      const fotos = await buscarMidias(unidade, "foto", "evento", perfilLead, 4);
      if (fotos.length === 0) return false;
      for (const foto of fotos) {
        await sendWhatsAppImage(whatsappNumber, foto.url);
      }
      return true;
    }
    case 4: {
      const [catalogo] = await buscarMidias(unidade, "catalogo", "catalogo", null, 1);
      if (!catalogo) return false;
      await sendWhatsAppDocument(whatsappNumber, catalogo.url, `Catalogo-${unidade}.pdf`);
      return true;
    }
  }
}

/**
 * Orquestra a régua de mídia progressiva para uma mensagem já processada:
 * lê a etapa atual, decide a próxima ação e envia via WhatsApp. Chamado só
 * no caminho do WhatsApp de teste/produção (mesma condição que já dispara a
 * confirmação automática em processMessage.job.ts).
 */
export async function processarMidiaProgressiva(
  whatsappNumber: string,
  leadId: string,
  ramo: RamoEvento | null,
  unidadeRecomendada: UnidadeRecomendada | null,
  dadosRamo: DadosPorRamo,
  numeroConvidados: number | null,
  sinal: SinalEngajamento
): Promise<void> {
  const log = logger.child({ leadId });

  if (!unidadeRecomendada) {
    log.debug("sem unidade recomendada ainda — motor de mídia aguarda mais dados do lead");
    return;
  }

  const etapaAtual = await getEtapaMidiaAtual(leadId);
  const acao = decidirProximaAcaoMidia(ramo, etapaAtual, sinal);

  if (acao.tipo === "aguardar_handoff") {
    log.info({ etapaAtual }, "régua de mídia esgotada — aguardando handoff humano (Seção 5, a implementar)");
    return;
  }

  if (acao.tipo === "nenhuma") {
    return;
  }

  const perfilLead = inferirPerfilLead(ramo, dadosRamo, numeroConvidados);
  const enviado = await enviarEtapaMidia(whatsappNumber, unidadeRecomendada, acao.etapa, perfilLead);

  if (!enviado) {
    log.warn(
      { unidadeRecomendada, etapa: acao.etapa },
      "nenhuma mídia ativa encontrada em media_library para esta etapa/unidade — biblioteca precisa ser populada"
    );
    return;
  }

  await registrarEnvioMidia(leadId, acao.etapa);
  log.info({ unidadeRecomendada, etapa: acao.etapa }, "mídia da régua progressiva enviada");
}
