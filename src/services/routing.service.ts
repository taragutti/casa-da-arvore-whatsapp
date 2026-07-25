import { DadosPorRamo, RamoEvento } from "./anthropic.service";

export type UnidadeRecomendada =
  | "casa_da_arvore"
  | "park_lagos"
  | "shopping_park_lagos"
  | "casarao"
  | "casa_por_do_sol";

/**
 * Tabelas de roteamento entre unidades por ramo (Fluxo_Detalhado_Bot_CRM_CasaDaArvore.docx,
 * Seção 3). Retorna null quando o ramo não tem regra de roteamento automático
 * (outro/não identificado) ou quando falta dado suficiente para decidir —
 * nesses casos o handoff humano decide, sem o bot arriscar palpite.
 */
export function determinarUnidadeRecomendada(
  ramo: RamoEvento | null,
  dadosRamo: DadosPorRamo,
  numeroConvidados: number | null,
  orcamentoMencionado: number | null
): UnidadeRecomendada | null {
  switch (ramo) {
    case "infantil":
      return determinarUnidadeInfantil(numeroConvidados, orcamentoMencionado);
    case "15_anos":
      return "casarao";
    case "casamento":
      return determinarUnidadeCasamento(dadosRamo);
    case "corporativo":
      return "casarao";
    case "recreacao_avulsa":
      return "shopping_park_lagos";
    case "outro":
    default:
      return null;
  }
}

/** Ramo A — Festa Infantil (Seção 3.1): roteamento por nº de convidados x investimento. */
function determinarUnidadeInfantil(
  numeroConvidados: number | null,
  orcamentoMencionado: number | null
): UnidadeRecomendada | null {
  if (numeroConvidados == null) return null;
  if (numeroConvidados <= 50) return "park_lagos";
  if (numeroConvidados <= 100) {
    if (orcamentoMencionado == null) return null; // decide pelo orçamento, ainda não informado
    return orcamentoMencionado > 20000 ? "casa_da_arvore" : "park_lagos";
  }
  return "casa_da_arvore"; // 100 a 200 ou mais de 200, qualquer faixa de investimento
}

/** Ramo C — Casamento (Seção 3.3): roteamento por sinal de preferência de espaço/origem do casal. */
function determinarUnidadeCasamento(dadosRamo: DadosPorRamo): UnidadeRecomendada | null {
  const { preferencia_espaco, origem_casal } = dadosRamo;

  if (preferencia_espaco === "vista_mar" || origem_casal === "outra_cidade" || origem_casal === "exterior") {
    return "casa_por_do_sol";
  }

  if ((preferencia_espaco === "climatizado" || preferencia_espaco === "aberto") && origem_casal === "cabo_frio") {
    return "casarao";
  }

  // Não especificou ou "aberto às duas opções": enviar mídia das duas unidades
  // e deixar o próprio lead sinalizar preferência antes do handoff (Seção 3.3).
  return null;
}
