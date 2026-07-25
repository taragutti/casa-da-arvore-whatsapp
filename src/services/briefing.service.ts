import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { extractJsonPayload } from "../utils/json";
import { DemandSignalRow } from "../repositories/briefings.repo";

export interface BriefingPorTipoEvento {
  tipo_evento: string;
  numero_registros: number;
  temas_recorrentes: string[];
  objecoes_recorrentes: string[];
  gatilho_emocional_dominante: string | null;
  sugestoes_de_pauta: string[];
  sugestoes_de_anuncio: string[];
}

export interface MonthlyBriefingContent {
  periodo: string;
  por_tipo_evento: BriefingPorTipoEvento[];
  insight_geral_do_mes: string;
}

// Prompt validado na especificação técnica (seção 6.3) — usar exatamente como está.
const SYSTEM_PROMPT = `Você é um estrategista de conteúdo e marketing para um negócio de festas e eventos. Você vai receber uma lista de registros extraídos de conversas reais de clientes no WhatsApp ao longo do último mês, organizados por tipo de evento.

Sua tarefa: identificar padrões recorrentes e devolver um briefing de conteúdo e tráfego pago pronto para uso, organizado por tipo de evento.

Retorne APENAS um JSON válido, sem texto adicional, sem markdown, sem explicação, no formato:
{
  "periodo": "mês/ano analisado",
  "por_tipo_evento": [
    {
      "tipo_evento": "nome do tipo",
      "numero_registros": número,
      "temas_recorrentes": ["até 5 temas ou palavras que mais se repetem"],
      "objecoes_recorrentes": ["até 3 objeções ou dúvidas mais frequentes"],
      "gatilho_emocional_dominante": "o gatilho que mais aparece nesse grupo",
      "sugestoes_de_pauta": ["3 ideias de post ou reels"],
      "sugestoes_de_anuncio": ["2 headlines de anúncio"]
    }
  ],
  "insight_geral_do_mes": "1 a 2 frases com o padrão mais importante do mês"
}

Regras:
- Baseie-se apenas nos dados fornecidos, não invente tendências.
- Priorize o que se repete mais vezes, não casos isolados.
- Se um tipo de evento tiver menos de 3 registros, inclua mesmo assim mas sinalize amostra pequena.`;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY não configurada — defina no .env antes de gerar o briefing.");
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

/** Agrupa os sinais de demanda por tipo_evento (seção 6.3, passo 3). */
export function agruparPorTipoEvento(sinais: DemandSignalRow[]): Map<string, DemandSignalRow[]> {
  const grupos = new Map<string, DemandSignalRow[]>();
  for (const sinal of sinais) {
    const tipo = sinal.tipo_evento ?? "outro";
    const grupo = grupos.get(tipo) ?? [];
    grupo.push(sinal);
    grupos.set(tipo, grupo);
  }
  return grupos;
}

/** Monta o payload de texto por grupo (seção 6.3, passo 4). */
export function montarPayloadTexto(grupos: Map<string, DemandSignalRow[]>): string {
  const blocos: string[] = [];

  for (const [tipoEvento, sinais] of grupos.entries()) {
    const palavrasChave = sinais.flatMap((s) => s.palavras_chave ?? []);
    const objecoes = sinais.map((s) => s.objecao_ou_duvida).filter((o): o is string => !!o);
    const gatilhos = sinais.map((s) => s.gatilho_emocional).filter((g): g is string => !!g);

    blocos.push(
      `${tipoEvento.toUpperCase()} (${sinais.length} registros):\n` +
        `- palavras-chave: [${palavrasChave.join(", ")}]\n` +
        `- objeções: [${objecoes.join(", ")}]\n` +
        `- gatilhos: [${gatilhos.join(", ")}]`
    );
  }

  return blocos.join("\n\n");
}

function sanitizeBriefing(raw: any, periodoFallback: string): MonthlyBriefingContent {
  const porTipoEvento: BriefingPorTipoEvento[] = Array.isArray(raw?.por_tipo_evento)
    ? raw.por_tipo_evento.map((item: any) => ({
        tipo_evento: typeof item?.tipo_evento === "string" ? item.tipo_evento : "outro",
        numero_registros: typeof item?.numero_registros === "number" ? item.numero_registros : 0,
        temas_recorrentes: Array.isArray(item?.temas_recorrentes)
          ? item.temas_recorrentes.filter((t: unknown) => typeof t === "string")
          : [],
        objecoes_recorrentes: Array.isArray(item?.objecoes_recorrentes)
          ? item.objecoes_recorrentes.filter((o: unknown) => typeof o === "string")
          : [],
        gatilho_emocional_dominante:
          typeof item?.gatilho_emocional_dominante === "string" ? item.gatilho_emocional_dominante : null,
        sugestoes_de_pauta: Array.isArray(item?.sugestoes_de_pauta)
          ? item.sugestoes_de_pauta.filter((s: unknown) => typeof s === "string")
          : [],
        sugestoes_de_anuncio: Array.isArray(item?.sugestoes_de_anuncio)
          ? item.sugestoes_de_anuncio.filter((s: unknown) => typeof s === "string")
          : [],
      }))
    : [];

  return {
    periodo: typeof raw?.periodo === "string" ? raw.periodo : periodoFallback,
    por_tipo_evento: porTipoEvento,
    insight_geral_do_mes: typeof raw?.insight_geral_do_mes === "string" ? raw.insight_geral_do_mes : "",
  };
}

/** Gera o briefing mensal via IA a partir do payload agregado (seção 6.3, passo 5). */
export async function gerarBriefingMensal(payloadTexto: string, periodo: string): Promise<MonthlyBriefingContent> {
  const anthropic = getClient();
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: payloadTexto }],
      });

      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("Resposta da IA não contém bloco de texto.");
      }

      const parsed = JSON.parse(extractJsonPayload(textBlock.text));
      return sanitizeBriefing(parsed, periodo);
    } catch (error) {
      lastError = error;
      logger.warn({ attempt, err: error }, "tentativa de geração do briefing falhou");
    }
  }

  throw new Error(`Falha ao gerar o briefing mensal após 2 tentativas: ${String(lastError)}`);
}
