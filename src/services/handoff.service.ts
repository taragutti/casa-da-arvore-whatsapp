import { RamoEvento, SinalEngajamento } from "./anthropic.service";
import { UnidadeRecomendada } from "./routing.service";

export type GatilhoHandoff =
  | "reclamacao"
  | "pedido_humano"
  | "pedido_contrato"
  | "pedido_visita"
  | "pergunta_valor"
  | "falha_classificacao_repetida";

export interface DecisaoHandoff {
  gatilho: GatilhoHandoff;
  /** Reclamação/insatisfação vai pro gerente, nunca resposta comercial padrão (Seção 5). */
  paraGerente: boolean;
}

const PALAVRAS_RECLAMACAO = [
  "reclamação",
  "reclamacao",
  "insatisfeito",
  "insatisfeita",
  "péssimo atendimento",
  "pessimo atendimento",
  "decepcionado",
  "decepcionada",
  "quero cancelar",
  "absurdo",
  "descaso",
];

const PALAVRAS_PEDIDO_HUMANO = [
  "consultor",
  "vendedor",
  "atendente",
  "pessoa de verdade",
  "ser humano",
  "com humano",
  "com alguém",
  "com alguem",
];

const PALAVRAS_PEDIDO_CONTRATO = [
  "quero fechar",
  "fechar contrato",
  "quero contratar",
  "vamos fechar",
  "bora fechar",
  "assinar contrato",
];

function contemAlgumTermo(mensagem: string, termos: string[]): boolean {
  const texto = mensagem.toLowerCase();
  return termos.some((termo) => texto.includes(termo));
}

/**
 * Detecta gatilhos de handoff IMEDIATO (Seção 5). Não cobre "3 mensagens de
 * dúvida seguidas" (handoff apenas sugerido, não imediato) — deixado de fora
 * de propósito: o documento não define objetivamente o que conta como
 * "mensagem de dúvida", e implementar um segundo contador em cima de um
 * critério inventado seria pior do que não ter a regra.
 */
export function detectarGatilhoHandoff(
  mensagem: string,
  sinal: SinalEngajamento,
  tentativasSemClassificacao: number
): DecisaoHandoff | null {
  if (contemAlgumTermo(mensagem, PALAVRAS_RECLAMACAO)) {
    return { gatilho: "reclamacao", paraGerente: true };
  }
  if (contemAlgumTermo(mensagem, PALAVRAS_PEDIDO_HUMANO)) {
    return { gatilho: "pedido_humano", paraGerente: false };
  }
  if (contemAlgumTermo(mensagem, PALAVRAS_PEDIDO_CONTRATO)) {
    return { gatilho: "pedido_contrato", paraGerente: false };
  }
  if (sinal === "pedido_visita") {
    return { gatilho: "pedido_visita", paraGerente: false };
  }
  if (sinal === "pergunta_valor") {
    return { gatilho: "pergunta_valor", paraGerente: false };
  }
  if (tentativasSemClassificacao >= 2) {
    return { gatilho: "falha_classificacao_repetida", paraGerente: false };
  }
  return null;
}

const SLA_MINUTOS_POR_UNIDADE: Record<UnidadeRecomendada, number> = {
  casa_da_arvore: 15,
  park_lagos: 15,
  casarao: 15,
  casa_por_do_sol: 20,
  shopping_park_lagos: 30,
};

/** SLA de resposta humana pós-handoff, em minutos (Seção 5). Corporativo tem SLA próprio (10 min), que sobrepõe o da unidade. */
export function calcularSlaMinutos(unidade: UnidadeRecomendada | null, ramo: RamoEvento | null): number {
  if (ramo === "corporativo") return 10;
  if (unidade == null) return 15; // fallback conservador enquanto não há unidade decidida
  return SLA_MINUTOS_POR_UNIDADE[unidade];
}

/**
 * Horário comercial assumido como segunda a sábado, 9h-18h (Brasília) — o
 * documento de fluxo não define isso explicitamente em nenhuma seção lida;
 * ajustar aqui se a operação real for diferente.
 */
export function dentroDoHorarioComercial(agora: Date = new Date()): boolean {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(agora);

  const hora = Number(partes.find((p) => p.type === "hour")?.value);
  const diaSemana = partes.find((p) => p.type === "weekday")?.value ?? "";

  if (diaSemana === "Sun") return false;
  return hora >= 9 && hora < 18;
}
