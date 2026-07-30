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

/**
 * Erros da Meta na família 132xxx são todos problemas do TEMPLATE em si
 * (não existe, não aprovado, pausado, desabilitado, número de parâmetros
 * errado, texto longo demais) — distintos de falha de rede/token/janela.
 * Separá-los permite decidir por fallback só quando o problema é o template.
 * Referência: códigos 132000–132016 da Cloud API.
 */
export class WhatsAppTemplateError extends Error {
  readonly metaCode: number | null;
  readonly ehProblemaDeTemplate: boolean;

  constructor(templateName: string, httpStatus: number, corpoResposta: string) {
    super(`Falha ao enviar template "${templateName}" via WhatsApp (${httpStatus}): ${corpoResposta}`);
    this.name = "WhatsAppTemplateError";

    let code: number | null = null;
    try {
      code = JSON.parse(corpoResposta)?.error?.code ?? null;
    } catch {
      code = null; // corpo não-JSON: trata como erro genérico, sem fallback
    }

    this.metaCode = typeof code === "number" ? code : null;
    this.ehProblemaDeTemplate = this.metaCode != null && this.metaCode >= 132000 && this.metaCode <= 132999;
  }
}

/**
 * Envia uma mensagem de template aprovado. Diferente do texto livre, funciona
 * fora da janela de 24h da Meta — é o único caminho confiável pra mensagem
 * iniciada pela empresa (notificação de vendedor, follow-ups).
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  variaveis: string[],
  languageCode = "pt_BR"
): Promise<void> {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    logger.warn("WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID não configurados — pulando envio de template.");
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
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: "body",
            parameters: variaveis.map((texto) => ({ type: "text", text: texto })),
          },
        ],
      },
    }),
  });

  if (!response.ok) {
    const detalhe = await response.text();
    throw new WhatsAppTemplateError(templateName, response.status, detalhe);
  }
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
 * Corpo EXATO que precisa ser submetido e aprovado na Meta (WhatsApp Manager →
 * Modelos de mensagem → Criar modelo), categoria **Utility**, idioma
 * **Portuguese (BR)**. Não é usado em runtime — existe aqui para que o corpo
 * aprovado e a ordem das variáveis vivam no mesmo arquivo que as monta.
 *
 * Se mudar este corpo, é obrigatório resubmeter o template na Meta E ajustar
 * montarVariaveisTemplateVendedor() na mesma ordem — os dois lados são
 * acoplados por posição, e trocar um só embaralha os campos silenciosamente.
 */
export const CORPO_TEMPLATE_HANDOFF = `Novo lead para atender.

Motivo: {{1}}
Prazo: {{2}}

Cliente: {{3}}
WhatsApp: {{4}}

Tipo de evento: {{5}}
Unidade sugerida: {{6}}
Dados do evento: {{7}}
Detalhes: {{8}}

Resumo: {{9}}

Última mensagem do cliente: {{10}}`;

const VALOR_AUSENTE = "não informado";

/** Limite do corpo de template da Meta, com margem para diferenças de contagem de caracteres. */
const LIMITE_CORPO_TEMPLATE = 1024;
const MARGEM_SEGURANCA = 24;

/** Texto fixo do template (tudo que não é variável) — derivado da constante para não virar número mágico. */
const TAMANHO_TEXTO_FIXO = CORPO_TEMPLATE_HANDOFF.replace(/\{\{\d+\}\}/g, "").length;

/** Orçamento total disponível para a soma de TODAS as variáveis. */
const ORCAMENTO_VARIAVEIS = LIMITE_CORPO_TEMPLATE - MARGEM_SEGURANCA - TAMANHO_TEXTO_FIXO;

/**
 * Limites dos campos derivados de enum/formato fixo — são naturalmente curtos,
 * mas o corte protege contra nome/e-mail absurdamente longos vindos do cliente.
 */
const LIMITES_CAMPOS_FIXOS = {
  motivo: 60,
  prazo: 90,
  cliente: 90,
  whatsapp: 25,
  ramo: 30,
  unidade: 30,
  dadosEvento: 70,
} as const;

/**
 * A Meta rejeita variável de template com quebra de linha, tab, 4+ espaços
 * seguidos, ou vazia.
 */
function sanitizarVariavelTemplate(valor: string | null | undefined, limite: number): string {
  const limpo = (valor ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!limpo) return VALOR_AUSENTE;
  return limpo.length > limite ? `${limpo.slice(0, limite - 1).trimEnd()}…` : limpo;
}

/** Achata os campos por ramo numa linha única — variável de template não aceita quebra de linha. */
function achatarDadosRamo(dadosRamo: Record<string, unknown>): string {
  return Object.entries(dadosRamo)
    .filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0))
    .map(([chave, valor]) => {
      const texto = Array.isArray(valor)
        ? valor.map(String).join("/")
        : typeof valor === "boolean"
          ? valor
            ? "sim"
            : "não"
          : String(valor);
      return `${formatarLabel(chave)}: ${texto}`;
    })
    .join(", ");
}

/**
 * Monta os 10 valores de {{1}}..{{10}} na ORDEM EXATA de
 * CORPO_TEMPLATE_HANDOFF. Ver aviso de acoplamento na doc daquela constante.
 */
export function montarVariaveisTemplateVendedor(r: ResumoLeadParaVendedor): string[] {
  const motivo = r.paraGerente ? `URGENTE (gerente) — ${formatarLabel(r.gatilho)}` : formatarLabel(r.gatilho);

  const prazo = r.dentroDoHorarioComercial
    ? `responder em até ${r.slaMinutos} min`
    : "fora do horário comercial — responder na primeira hora do próximo dia útil";

  const cliente = r.email ? `${r.nomeCliente ?? VALOR_AUSENTE} (${r.email})` : (r.nomeCliente ?? VALOR_AUSENTE);

  const dadosEvento = [
    r.dataEvento ? `data ${r.dataEvento}` : null,
    r.numeroConvidados != null ? `${r.numeroConvidados} convidados` : null,
    r.orcamentoMencionado != null ? `orçamento R$ ${r.orcamentoMencionado.toLocaleString("pt-BR")}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const resumo = [r.resumoPedido, r.objecaoOuDuvida ? `Objeção: ${r.objecaoOuDuvida}` : null]
    .filter(Boolean)
    .join(" | ");

  // Campos bounded primeiro — o que sobra do orçamento vai pros três campos de
  // texto livre (detalhes, resumo, mensagem), que são os únicos que podem
  // crescer sem limite natural. Sem isso, o corpo montado estoura o limite de
  // 1024 da Meta e o envio é rejeitado.
  const fixos = [
    sanitizarVariavelTemplate(motivo, LIMITES_CAMPOS_FIXOS.motivo),
    sanitizarVariavelTemplate(prazo, LIMITES_CAMPOS_FIXOS.prazo),
    sanitizarVariavelTemplate(cliente, LIMITES_CAMPOS_FIXOS.cliente),
    sanitizarVariavelTemplate(r.whatsappCliente, LIMITES_CAMPOS_FIXOS.whatsapp),
    sanitizarVariavelTemplate(r.ramo ? formatarLabel(r.ramo) : null, LIMITES_CAMPOS_FIXOS.ramo),
    sanitizarVariavelTemplate(
      r.unidadeRecomendada ? formatarLabel(r.unidadeRecomendada) : null,
      LIMITES_CAMPOS_FIXOS.unidade
    ),
    sanitizarVariavelTemplate(dadosEvento, LIMITES_CAMPOS_FIXOS.dadosEvento),
  ];

  const gastoFixo = fixos.reduce((total, v) => total + v.length, 0);
  const restante = Math.max(0, ORCAMENTO_VARIAVEIS - gastoFixo);

  // A mensagem do cliente é o contexto mais útil pro vendedor, então fica com
  // a maior fatia; detalhes e resumo dividem o resto.
  const limiteMensagem = Math.floor(restante * 0.4);
  const limiteDetalhes = Math.floor(restante * 0.3);
  const limiteResumo = restante - limiteMensagem - limiteDetalhes;

  return [
    ...fixos,
    sanitizarVariavelTemplate(achatarDadosRamo(r.dadosRamo), limiteDetalhes),
    sanitizarVariavelTemplate(resumo, limiteResumo),
    sanitizarVariavelTemplate(r.mensagemOriginal, limiteMensagem),
  ];
}

/**
 * Notifica o vendedor no WhatsApp sobre um lead em handoff (Seção 5).
 *
 * Usa template aprovado quando VENDEDOR_HANDOFF_TEMPLATE_NAME está definido
 * (entrega garantida, independente da janela de 24h da Meta); senão cai pra
 * texto livre, que só é entregue se o vendedor tiver mandado mensagem pro bot
 * nas últimas 24h.
 *
 * Se o template estiver configurado mas a Meta recusar por problema do próprio
 * template (não existe, ainda em análise, pausado — família 132xxx), tenta
 * texto livre em seguida e loga o motivo em nível de erro. Assim a variável
 * pode ser definida ANTES da aprovação sair sem derrubar a notificação, e a
 * má configuração continua visível no log em vez de silenciosa.
 *
 * Erros que não são do template (token, rede, número inválido) não fazem
 * fallback — retentar como texto livre não resolveria e só mascararia a causa.
 */
export async function notificarVendedor(resumo: ResumoLeadParaVendedor): Promise<void> {
  if (!env.VENDEDOR_WHATSAPP_NUMBER) {
    logger.warn("VENDEDOR_WHATSAPP_NUMBER não configurado — handoff notificado só por e-mail.");
    return;
  }

  const destino = env.VENDEDOR_WHATSAPP_NUMBER;
  const templateName = env.VENDEDOR_HANDOFF_TEMPLATE_NAME;

  if (!templateName) {
    logger.warn(
      "VENDEDOR_HANDOFF_TEMPLATE_NAME não configurado — enviando texto livre, que só é entregue dentro da janela de 24h da Meta."
    );
    await sendWhatsAppMessage(destino, montarResumoParaVendedor(resumo));
    return;
  }

  try {
    await sendWhatsAppTemplate(destino, templateName, montarVariaveisTemplateVendedor(resumo));
  } catch (error) {
    if (error instanceof WhatsAppTemplateError && error.ehProblemaDeTemplate) {
      logger.error(
        { templateName, metaCode: error.metaCode, err: error },
        "template de handoff recusado pela Meta (não existe, em análise ou pausado) — caindo pra texto livre, que só chega dentro da janela de 24h"
      );
      await sendWhatsAppMessage(destino, montarResumoParaVendedor(resumo));
      return;
    }
    throw error;
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
