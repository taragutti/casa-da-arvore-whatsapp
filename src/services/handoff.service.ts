import { RamoEvento, SinalEngajamento } from "./anthropic.service";
import { UnidadeRecomendada } from "./routing.service";

export type GatilhoHandoff =
  | "reclamacao"
  | "pedido_humano"
  | "pedido_contrato"
  | "pedido_visita"
  | "pergunta_valor"
  | "falha_classificacao_repetida"
  // Motivos que só o script guiado produz (Script_Bot_Atendimento.docx). Ficam
  // no mesmo tipo de propósito: o vendedor recebe a mesma notificação venha o
  // handoff de onde vier, e o Record de labels no e-mail obriga, em tempo de
  // compilação, a dar nome a qualquer motivo novo.
  | "fim_da_qualificacao"
  | "corporativo_ficha_tecnica"
  | "evento_fora_do_padrao"
  | "roteamento_indefinido"
  | "pergunta_valor_final"
  | "pedido_desconto"
  | "precisa_qualificacao_humana";

export interface DecisaoHandoff {
  gatilho: GatilhoHandoff;
  /** Reclamação/insatisfação vai pro gerente, nunca resposta comercial padrão (Seção 5). */
  paraGerente: boolean;
}

/**
 * Regras de handoff que o painel pode editar (estágio 8).
 *
 * As funções abaixo recebem isto como parâmetro OPCIONAL, com os padrões
 * originais. Manter as funções puras e síncronas foi deliberado: elas são o
 * núcleo de decisão do handoff e ficam muito mais fáceis de testar sem precisar
 * de banco. Quem tem acesso ao banco (o pipeline de mensagem) passa a
 * configuração salva; teste e chamada direta seguem funcionando sem nada.
 */
export interface RegrasHandoff {
  palavrasReclamacao: string[];
  palavrasPedidoHumano: string[];
  palavrasPedidoContrato: string[];
  tentativasSemClassificacaoLimite: number;
}

export interface RegrasSla {
  porUnidade: Record<UnidadeRecomendada, number>;
  corporativo: number;
  semUnidade: number;
}

export interface RegrasHorario {
  horaAbertura: number;
  horaFechamento: number;
  atendeSabado: boolean;
  atendeDomingo: boolean;
}

/**
 * Número de WhatsApp do vendedor humano que recebe o handoff, por unidade.
 * Dois vendedores reais dividindo por tipo de evento: `padrao` cobre unidade
 * ainda indefinida (ramo "outro", ou casamento sem preferência informada) —
 * nesse caso não há como escolher pela unidade, então cai no vendedor
 * comercial em vez de arriscar palpite.
 */
export interface RegrasVendedor {
  porUnidade: Record<UnidadeRecomendada, string>;
  padrao: string;
}

/**
 * Padrões que estavam fixos no código. Continuam sendo a fonte única: os
 * DEFAULTs da tabela `configuracoes` repetem estes valores, e um banco recém
 * migrado se comporta exatamente como antes.
 */
export const REGRAS_HANDOFF_PADRAO: RegrasHandoff = {
  palavrasReclamacao: [
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
  ],
  palavrasPedidoHumano: [
    "consultor",
    "vendedor",
    "atendente",
    "pessoa de verdade",
    "ser humano",
    "com humano",
    "com alguém",
    "com alguem",
  ],
  palavrasPedidoContrato: [
    "quero fechar",
    "fechar contrato",
    "quero contratar",
    "vamos fechar",
    "bora fechar",
    "assinar contrato",
  ],
  tentativasSemClassificacaoLimite: 2,
};

export const REGRAS_SLA_PADRAO: RegrasSla = {
  porUnidade: {
    casa_da_arvore: 15,
    park_lagos: 15,
    casarao: 15,
    casa_por_do_sol: 20,
    shopping_park_lagos: 30,
  },
  corporativo: 10,
  semUnidade: 15,
};

export const REGRAS_HORARIO_PADRAO: RegrasHorario = {
  horaAbertura: 9,
  horaFechamento: 18,
  atendeSabado: true,
  atendeDomingo: false,
};

export const REGRAS_VENDEDOR_PADRAO: RegrasVendedor = {
  porUnidade: {
    casa_da_arvore: "+5522974052903",
    park_lagos: "+5522974052903",
    shopping_park_lagos: "+5522974052903",
    casarao: "+5522997249462",
    casa_por_do_sol: "+5522997249462",
  },
  padrao: "+5522997249462",
};

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
  tentativasSemClassificacao: number,
  regras: RegrasHandoff = REGRAS_HANDOFF_PADRAO
): DecisaoHandoff | null {
  if (contemAlgumTermo(mensagem, regras.palavrasReclamacao)) {
    return { gatilho: "reclamacao", paraGerente: true };
  }
  if (contemAlgumTermo(mensagem, regras.palavrasPedidoHumano)) {
    return { gatilho: "pedido_humano", paraGerente: false };
  }
  if (contemAlgumTermo(mensagem, regras.palavrasPedidoContrato)) {
    return { gatilho: "pedido_contrato", paraGerente: false };
  }
  if (sinal === "pedido_visita") {
    return { gatilho: "pedido_visita", paraGerente: false };
  }
  if (sinal === "pergunta_valor") {
    return { gatilho: "pergunta_valor", paraGerente: false };
  }
  if (tentativasSemClassificacao >= regras.tentativasSemClassificacaoLimite) {
    return { gatilho: "falha_classificacao_repetida", paraGerente: false };
  }
  return null;
}

/** SLA de resposta humana pós-handoff, em minutos (Seção 5). Corporativo tem SLA próprio, que sobrepõe o da unidade. */
export function calcularSlaMinutos(
  unidade: UnidadeRecomendada | null,
  ramo: RamoEvento | null,
  regras: RegrasSla = REGRAS_SLA_PADRAO
): number {
  if (ramo === "corporativo") return regras.corporativo;
  if (unidade == null) return regras.semUnidade; // fallback enquanto não há unidade decidida
  // `?? semUnidade` cobre unidade nova adicionada no código antes de existir no
  // JSON salvo — sem isso o SLA viria `undefined` e o e-mail mostraria "NaN min".
  return regras.porUnidade[unidade] ?? regras.semUnidade;
}

/**
 * Número do vendedor que recebe o handoff no WhatsApp, por unidade (mesmo
 * molde de `calcularSlaMinutos`: unidade decide, corporativo não precisa de
 * regra própria porque `determinarUnidadeRecomendada` já resolve corporativo
 * e 15 anos para "casarao" antes de chegar aqui).
 */
export function determinarNumeroVendedor(
  unidade: UnidadeRecomendada | null,
  regras: RegrasVendedor = REGRAS_VENDEDOR_PADRAO
): string {
  if (unidade == null) return regras.padrao;
  // `?? padrao` cobre unidade nova adicionada no código antes de existir no
  // JSON salvo — mesma proteção que o SLA já tem contra "unidade sem regra".
  return regras.porUnidade[unidade] ?? regras.padrao;
}

/**
 * Horário comercial no fuso America/Sao_Paulo. O documento de fluxo não define
 * isso; o padrão (seg–sáb, 9h–18h) era uma suposição, e agora é editável no
 * painel justamente por isso.
 */
export function dentroDoHorarioComercial(
  agora: Date = new Date(),
  regras: RegrasHorario = REGRAS_HORARIO_PADRAO
): boolean {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(agora);

  const hora = Number(partes.find((p) => p.type === "hour")?.value);
  const diaSemana = partes.find((p) => p.type === "weekday")?.value ?? "";

  if (diaSemana === "Sun" && !regras.atendeDomingo) return false;
  if (diaSemana === "Sat" && !regras.atendeSabado) return false;
  return hora >= regras.horaAbertura && hora < regras.horaFechamento;
}
