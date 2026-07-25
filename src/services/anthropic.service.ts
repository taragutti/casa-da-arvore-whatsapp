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

// Ramo = branch do fluxo do bot (Fluxo_Detalhado_Bot_CRM_CasaDaArvore.docx,
// Seção 3) — taxonomia própria do roteamento entre unidades, distinta de
// tipo_evento (usado hoje pelo briefing mensal e mantida por compatibilidade).
const RAMOS = ["infantil", "15_anos", "casamento", "corporativo", "recreacao_avulsa", "outro"] as const;

// Sinal de engajamento (Seção 4) — usado pelo motor de mídia progressiva
// para decidir quando avançar de etapa, sem precisar de uma segunda chamada de IA.
const SINAIS_ENGAJAMENTO = ["positivo", "neutro", "negativo", "pergunta_valor", "pedido_visita"] as const;

const FORMATOS_15_ANOS = ["tradicional", "moderno", "intimista", "nao_decidiu"] as const;
const ORIGENS_CASAL = ["cabo_frio", "outra_cidade", "exterior"] as const;
const PREFERENCIAS_ESPACO = ["vista_mar", "climatizado", "aberto", "aberto_as_duas"] as const;
const TIPOS_EVENTO_CORPORATIVO = ["convencao", "confraternizacao", "treinamento", "lancamento"] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number];
export type GatilhoEmocional = (typeof GATILHOS_EMOCIONAIS)[number];
export type RamoEvento = (typeof RAMOS)[number];
export type SinalEngajamento = (typeof SINAIS_ENGAJAMENTO)[number];
export type FormatoFesta15Anos = (typeof FORMATOS_15_ANOS)[number];
export type OrigemCasal = (typeof ORIGENS_CASAL)[number];
export type PreferenciaEspaco = (typeof PREFERENCIAS_ESPACO)[number];
export type TipoEventoCorporativo = (typeof TIPOS_EVENTO_CORPORATIVO)[number];

/** Campos por ramo (Seção 7 do fluxo detalhado) — todos nuláveis, só os do ramo identificado vêm preenchidos. */
export interface DadosPorRamo {
  // Ramo A — Festa Infantil
  nome_aniversariante: string | null;
  idade_aniversariante: number | null;
  tema_festa: string | null;
  // Ramo B — 15 Anos
  nome_debutante: string | null;
  formato_festa: FormatoFesta15Anos | null;
  // Ramo C — Casamento
  nomes_noivos: string | null;
  origem_casal: OrigemCasal | null;
  preferencia_espaco: PreferenciaEspaco | null;
  interesse_hospedagem: boolean | null;
  // Ramo D — Corporativo
  nome_empresa: string | null;
  contato_nome: string | null;
  contato_cargo: string | null;
  tipo_evento_corporativo: TipoEventoCorporativo | null;
  necessidades_tecnicas: string[];
  // Ramo E — Recreação Avulsa
  nome_responsavel: string | null;
  nome_crianca: string | null;
  idade_crianca: number | null;
  data_aniversario_crianca: string | null; // AAAA-MM-DD
}

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
  ramo: RamoEvento | null;
  dados_ramo: DadosPorRamo;
  sinal_engajamento: SinalEngajamento;
}

// Prompt validado na especificação técnica (seção 6.2), estendido para o
// fluxo detalhado do bot (Seção 3 — ramo/roteamento, Seção 4 — sinal de
// engajamento) numa única chamada, sem gastar crédito extra de IA.
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
  "gatilho_emocional": "uma das opções: economia, exclusividade, tranquilidade, status, praticidade, outro, ou null",
  "ramo": "uma das opções: infantil, 15_anos, casamento, corporativo, recreacao_avulsa, outro, ou null se não for possível classificar",
  "dados_ramo": {
    "nome_aniversariante": "string ou null — só para ramo infantil",
    "idade_aniversariante": "número ou null — só para ramo infantil",
    "tema_festa": "string ou null — só para ramo infantil",
    "nome_debutante": "string ou null — só para ramo 15_anos",
    "formato_festa": "tradicional | moderno | intimista | nao_decidiu | null — só para ramo 15_anos",
    "nomes_noivos": "string ou null — só para ramo casamento",
    "origem_casal": "cabo_frio | outra_cidade | exterior | null — só para ramo casamento",
    "preferencia_espaco": "vista_mar | climatizado | aberto | aberto_as_duas | null — só para ramo casamento",
    "interesse_hospedagem": "true | false | null — só para ramo casamento",
    "nome_empresa": "string ou null — só para ramo corporativo",
    "contato_nome": "string ou null — só para ramo corporativo",
    "contato_cargo": "string ou null — só para ramo corporativo",
    "tipo_evento_corporativo": "convencao | confraternizacao | treinamento | lancamento | null — só para ramo corporativo",
    "necessidades_tecnicas": ["lista de strings, ex: auditório, catering, estacionamento, internet — só para ramo corporativo"],
    "nome_responsavel": "string ou null — só para ramo recreacao_avulsa",
    "nome_crianca": "string ou null — só para ramo recreacao_avulsa",
    "idade_crianca": "número ou null — só para ramo recreacao_avulsa",
    "data_aniversario_crianca": "AAAA-MM-DD ou null — só para ramo recreacao_avulsa, campo crítico para cross-sell"
  },
  "sinal_engajamento": "uma das opções: positivo, neutro, negativo, pergunta_valor, pedido_visita"
}

Regras:
- Se a informação não estiver na mensagem, use null. Nunca invente dados.
- Extraia números mesmo se escritos por extenso.
- Datas relativas ("mês que vem", "em setembro") deixe null e mencione em resumo_pedido.
- palavras_chave deve usar, sempre que possível, as palavras exatas do cliente.
- tipo_evento e gatilho_emocional devem usar EXATAMENTE um dos valores enum listados, em minúsculas, com underscore.
- ramo é uma classificação separada de tipo_evento, para o roteamento entre unidades: infantil, 15_anos, casamento, corporativo e recreacao_avulsa mapeiam para os 5 tipos de evento principais do negócio; use outro para qualquer coisa fora desses 5 (chá de bebê, batizado, evento fora do padrão) ou mensagem que você não consiga classificar com confiança.
- dados_ramo: preencha SOMENTE os campos do ramo identificado; todos os campos de outros ramos ficam null (ou [] para necessidades_tecnicas). Se ramo for null ou outro, todos os campos de dados_ramo ficam null/[].
- sinal_engajamento classifica a reação do cliente à conversa até agora, não o conteúdo do pedido: positivo (emoji, elogio, pergunta específica, pedido de mais informação/mídia), pergunta_valor (pergunta direta sobre preço/valor/desconto), pedido_visita (quer marcar ou visitar o espaço), negativo (desinteresse, "vou ver depois", objeção forte), neutro (mensagem informativa sem sinal claro de nenhum dos anteriores — use este como padrão).`;

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

/** Valida e normaliza dados_ramo — mesmo princípio do sanitize() principal: nunca confiar cegamente na IA. */
function sanitizeDadosRamo(raw: any): DadosPorRamo {
  const r = raw ?? {};
  return {
    nome_aniversariante: typeof r.nome_aniversariante === "string" ? r.nome_aniversariante : null,
    idade_aniversariante: typeof r.idade_aniversariante === "number" ? r.idade_aniversariante : null,
    tema_festa: typeof r.tema_festa === "string" ? r.tema_festa : null,

    nome_debutante: typeof r.nome_debutante === "string" ? r.nome_debutante : null,
    formato_festa: FORMATOS_15_ANOS.includes(r.formato_festa) ? r.formato_festa : null,

    nomes_noivos: typeof r.nomes_noivos === "string" ? r.nomes_noivos : null,
    origem_casal: ORIGENS_CASAL.includes(r.origem_casal) ? r.origem_casal : null,
    preferencia_espaco: PREFERENCIAS_ESPACO.includes(r.preferencia_espaco) ? r.preferencia_espaco : null,
    interesse_hospedagem: typeof r.interesse_hospedagem === "boolean" ? r.interesse_hospedagem : null,

    nome_empresa: typeof r.nome_empresa === "string" ? r.nome_empresa : null,
    contato_nome: typeof r.contato_nome === "string" ? r.contato_nome : null,
    contato_cargo: typeof r.contato_cargo === "string" ? r.contato_cargo : null,
    tipo_evento_corporativo: TIPOS_EVENTO_CORPORATIVO.includes(r.tipo_evento_corporativo)
      ? r.tipo_evento_corporativo
      : null,
    necessidades_tecnicas: Array.isArray(r.necessidades_tecnicas)
      ? r.necessidades_tecnicas.filter((n: unknown) => typeof n === "string")
      : [],

    nome_responsavel: typeof r.nome_responsavel === "string" ? r.nome_responsavel : null,
    nome_crianca: typeof r.nome_crianca === "string" ? r.nome_crianca : null,
    idade_crianca: typeof r.idade_crianca === "number" ? r.idade_crianca : null,
    data_aniversario_crianca:
      typeof r.data_aniversario_crianca === "string" && isValidDate(r.data_aniversario_crianca)
        ? r.data_aniversario_crianca
        : null,
  };
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

  const ramo: RamoEvento | null = RAMOS.includes(raw?.ramo) ? raw.ramo : raw?.ramo ? "outro" : null;

  const sinal_engajamento: SinalEngajamento = SINAIS_ENGAJAMENTO.includes(raw?.sinal_engajamento)
    ? raw.sinal_engajamento
    : "neutro";

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
    ramo,
    dados_ramo: sanitizeDadosRamo(raw?.dados_ramo),
    sinal_engajamento,
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
