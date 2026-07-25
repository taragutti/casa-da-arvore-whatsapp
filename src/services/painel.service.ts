import { LeadPainel } from "../repositories/painel.repo";
import { escapeHtml } from "../utils/html";

/** Formata um valor de dados_coletados (JSONB) pra exibição — arrays viram lista separada por vírgula. */
function formatarValor(valor: unknown): string {
  if (valor == null || valor === "") return "—";
  if (Array.isArray(valor)) return valor.length ? valor.map(String).join(", ") : "—";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  return String(valor);
}

/** Renderiza os campos coletados por ramo (Seção 7) como uma lista compacta "campo: valor". */
function formatarDadosColetados(dados: Record<string, unknown> | null): string {
  if (!dados) return "—";
  const entradas = Object.entries(dados).filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0));
  if (entradas.length === 0) return "—";
  return entradas.map(([chave, valor]) => `<strong>${escapeHtml(chave)}:</strong> ${escapeHtml(formatarValor(valor))}`).join("<br>");
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

function linhaLead(lead: LeadPainel): string {
  const emHandoff = lead.em_atendimento_humano
    ? '<span style="color:#b00020;font-weight:bold;">● atendimento humano</span>'
    : '<span style="color:#2f5233;">bot</span>';

  return `
    <tr>
      <td>${escapeHtml(lead.nome_cliente ?? "não informado")}<br><small>${escapeHtml(lead.whatsapp_number)}</small></td>
      <td>${escapeHtml(lead.ramo ?? lead.tipo_evento ?? "—")}</td>
      <td>${escapeHtml(lead.unidade_recomendada ?? "—")}</td>
      <td>${escapeHtml(lead.etapa_atual ?? "—")}</td>
      <td>${escapeHtml(lead.status)}</td>
      <td>${emHandoff}</td>
      <td>${escapeHtml((lead.tags ?? []).join(", ") || "—")}</td>
      <td>${formatarData(lead.created_at)}</td>
      <td>${formatarData(lead.ultima_interacao)}</td>
      <td>${formatarDadosColetados(lead.dados_coletados)}</td>
    </tr>`;
}

/**
 * Painel mínimo de visibilidade (Seção 7) — uma tabela HTML server-rendered,
 * sem framework de front-end, com os campos consolidados de CRM por lead.
 *
 * Duas lacunas conhecidas, não implementadas em nenhum lugar do sistema
 * ainda (por isso aparecem sempre vazias aqui): "e-mail (coletado no
 * handoff)" — nunca é coletado, nem no handoff.service.ts nem na extração
 * via IA — e "cupom aceito (S/N)" do ramo recreação avulsa — não há
 * rastreio de aceite de cupom em lugar nenhum do sistema.
 */
export function renderizarPainelHtml(leads: LeadPainel[]): string {
  const linhas = leads.map(linhaLead).join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Painel — Casa da Árvore</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #222; }
    h1 { color: #2f5233; }
    table { border-collapse: collapse; width: 100%; font-size: 13px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #2f5233; color: white; position: sticky; top: 0; }
    tr:nth-child(even) { background: #f7f7f7; }
    .aviso { background: #fff3cd; border: 1px solid #ffe69c; padding: 12px; border-radius: 6px; margin-bottom: 16px; font-size: 14px; }
  </style>
</head>
<body>
  <h1>Painel — Casa da Árvore</h1>
  <p>${leads.length} lead(s) mais recentemente ativos (limite de 200, sem paginação — painel mínimo).</p>
  <div class="aviso">
    <strong>Campos não coletados por nenhuma parte do sistema ainda:</strong> e-mail do cliente e aceite de cupom
    (ramo recreação avulsa). Aparecem sempre vazios abaixo.
  </div>
  <table>
    <thead>
      <tr>
        <th>Cliente</th>
        <th>Ramo / Tipo</th>
        <th>Unidade recomendada</th>
        <th>Etapa do funil</th>
        <th>Status</th>
        <th>Atendimento</th>
        <th>Tags</th>
        <th>Primeiro contato</th>
        <th>Última interação</th>
        <th>Dados coletados</th>
      </tr>
    </thead>
    <tbody>
      ${linhas || '<tr><td colspan="10">Nenhum lead encontrado.</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;
}
