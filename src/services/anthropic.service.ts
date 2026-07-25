import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { extractJsonPayload } from "../utils/json";

const TIPOS_EVENTO = [
  "aniversario_infantil",
  "casamento",
  "debutante",
  "corporativo",
  "cha_de_bebe",
  "outro",
] as const;

const GATILHOS_EMOCIONAIS = [
  "economia",
  "exclusividade",
  "tranquilidade",
  "status",
  "praticidade",
  "outro",
] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number];
export type GatilhoEmocional = (typeof GATILHOS_EMOCIONAIS)[number];

export interface ExtractedLeadData {
  nome_cliente: string | null;
  tipo_evento: TipoEvento | null;
  data_evento: string | null; // AAAA-MM-DD
  numero_convidados: number | null;
  orcamento_mencionado: number | null;
  resumo_pedido: string;
  palavras_chave: string[];
  objecao_ou_duvida: string | null;
  gatilho_emocional: GatilhoEmocional | null;
}

// Prompt validado na especificação técnica (seção 6.2) — usar exatamente como está.
const SYSTEM_PROMPT = `Você é um assistente que extrai dados estruturados de mensagens de clientes interessados em festas e eventos. Leia a mensagem do cliente e retorne APENAS um JSON válido, sem nenhum texto adicional, sem markdown, sem explicação.

Formato exato de saída:
{
  "nome_cliente": "string ou null se não informado",
  "tipo_evento": "uma das opções: aniversario_infantil, casamento, debutante, corporativo, cha_de_bebe, outro, ou null",
  "data_evento": "AAAA-MM-DD ou null se não informado",
  "numero_convidados": número inteiro ou null,
  "orcamento_mencionado": número em reais ou null,
  "resumo_pedido": "resumo em até 15 palavras do que o cliente quer",
  "palavras_chave": ["3 a 5 termos ou expressões literais usados pelo cliente"],
  "objecao_ou_duvida": "principal receio ou dúvida expressos, ou null",
  "gatilho_emocional": "uma das opções: economia, exclusividade, tranquilidade, status, praticidade, outro, ou null"
}

Regras:
- Se a informação não estiver na mensagem, use null. Nunca invente dados.
- Extraia números mesmo se escritos por extenso.
- Datas relativas ("mês que vem", "em setembro") deixe null e mencione em resumo_pedido.
- palavras_chave deve usar, sempre que possível, as palavras exatas do cliente.
- tipo_evento e gatilho_emocional devem usar EXATAMENTE um dos valores enum listados, em minúsculas, com underscore.`;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY não configurada — defina no .env antes de chamar a extração.");
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Valida e normaliza a saída da IA — nunca confia cegamente na resposta (seção 6.2). */
function sanitize(raw: any): ExtractedLeadData {
  const tipo_evento: TipoEvento | null = TIPOS_EVENTO.includes(raw?.tipo_evento)
    ? raw.tipo_evento
    : raw?.tipo_evento
      ? "outro"
      : null;

  const gatilho_emocional: GatilhoEmocional | null = GATILHOS_EMOCIONAIS.includes(raw?.gatilho_emocional)
    ? raw.gatilho_emocional
    : raw?.gatilho_emocional
      ? "outro"
      : null;

  const data_evento =
    typeof raw?.data_evento === "string" && isValidDate(raw.data_evento) ? raw.data_evento : null;

  return {
    nome_cliente: typeof raw?.nome_cliente === "string" ? raw.nome_cliente : null,
    tipo_evento,
    data_evento,
    numero_convidados: typeof raw?.numero_convidados === "number" ? raw.numero_convidados : null,
    orcamento_mencionado: typeof raw?.orcamento_mencionado === "number" ? raw.orcamento_mencionado : null,
    resumo_pedido: typeof raw?.resumo_pedido === "string" ? raw.resumo_pedido : "",
    palavras_chave: Array.isArray(raw?.palavras_chave) ? raw.palavras_chave.filter((p: unknown) => typeof p === "string") : [],
    objecao_ou_duvida: typeof raw?.objecao_ou_duvida === "string" ? raw.objecao_ou_duvida : null,
    gatilho_emocional,
  };
}

/** Extrai dados estruturados de uma mensagem de cliente, com retry (máx. 2 tentativas). */
export async function extractFromMessage(mensagem: string): Promise<ExtractedLeadData> {
  const anthropic = getClient();
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Mensagem do cliente: ${mensagem}` }],
      });

      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("Resposta da IA não contém bloco de texto.");
      }

      const parsed = JSON.parse(extractJsonPayload(textBlock.text));
      return sanitize(parsed);
    } catch (error) {
      lastError = error;
      logger.warn({ attempt, err: error }, "tentativa de extração via IA falhou");
    }
  }

  throw new Error(`Falha na extração via IA após 2 tentativas: ${String(lastError)}`);
}
