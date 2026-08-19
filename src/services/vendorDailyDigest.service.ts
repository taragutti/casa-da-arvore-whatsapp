import { LeadResumoDiario } from "../repositories/leads.repo";
import { UnidadeRecomendada } from "./routing.service";

const LABEL_UNIDADE: Record<UnidadeRecomendada, string> = {
  casa_da_arvore: "Casa da Árvore",
  park_lagos: "Park Lagos",
  shopping_park_lagos: "Shopping Park Lagos",
  casarao: "Casarão",
  casa_por_do_sol: "Casa Pôr do Sol",
};

const LABEL_STATUS: Record<string, string> = {
  novo: "novo",
  qualificando: "qualificando",
  proposta_enviada: "proposta enviada",
  negociacao: "em negociação",
};

function formatarLabel(valor: string | null): string {
  return valor ? valor.replace(/_/g, " ") : "não informado";
}

/** Um bloco por lead, no estilo do card de notificação de lead novo (nome, celular, e-mail, evento, data). */
function montarBlocoLead(lead: LeadResumoDiario, indice: number): string {
  return [
    `${indice}) *${lead.nome_cliente ?? "não informado"}*`,
    `   Cel: ${lead.whatsapp_number}`,
    `   Email: ${lead.email ?? "não informado"}`,
    `   Evento: ${formatarLabel(lead.tipo_evento)}`,
    `   Data da festa: ${lead.data_evento ?? "não informado"}`,
    `   Status: ${LABEL_STATUS[lead.status] ?? lead.status}`,
  ].join("\n");
}

/**
 * Monta o resumo diário de leads ativos de um vendedor, agrupado por unidade
 * (um vendedor pode atender mais de uma). Retorna `null` quando não há
 * nenhum lead ativo em nenhuma das unidades — o job não manda mensagem
 * vazia (vendorDailyDigest.cron.ts).
 */
export function montarResumoDiarioParaVendedor(
  leadsPorUnidade: Map<UnidadeRecomendada, LeadResumoDiario[]>
): string | null {
  const secoes: string[] = [];
  let total = 0;

  for (const [unidade, leads] of leadsPorUnidade.entries()) {
    if (leads.length === 0) continue;
    total += leads.length;
    secoes.push(
      [`*${LABEL_UNIDADE[unidade]}* (${leads.length})`, ...leads.map((l, i) => montarBlocoLead(l, i + 1))].join("\n\n")
    );
  }

  if (total === 0) return null;

  return [`🌳 *Resumo diário de leads ativos* (${total})`, ...secoes].join("\n\n");
}
