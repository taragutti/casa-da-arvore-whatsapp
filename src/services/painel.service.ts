import { LeadPainel } from "../repositories/painel.repo";
import { Autor } from "../middleware/auth";
import { escapeHtml } from "../utils/html";

/** Rótulos legíveis — o banco guarda snake_case, mas quem atende não deveria ler "proposta_enviada". */
const LABEL_STATUS: Record<string, string> = {
  novo: "Novo",
  qualificando: "Qualificando",
  proposta_enviada: "Proposta enviada",
  negociacao: "Negociação",
  fechado: "Fechado",
  perdido: "Perdido",
};

const LABEL_UNIDADE: Record<string, string> = {
  casa_da_arvore: "Casa da Árvore",
  park_lagos: "Park Lagos",
  shopping_park_lagos: "Shopping Park Lagos",
  casarao: "Casarão",
  casa_por_do_sol: "Casa Pôr do Sol",
};

const LABEL_RAMO: Record<string, string> = {
  infantil: "Festa infantil",
  "15_anos": "15 anos",
  casamento: "Casamento",
  corporativo: "Corporativo",
  recreacao_avulsa: "Recreação avulsa",
  outro: "Outro / não identificado",
};

function rotular(mapa: Record<string, string>, valor: string | null): string {
  if (!valor) return "—";
  return mapa[valor] ?? valor.replace(/_/g, " ");
}

function formatarValor(valor: unknown): string {
  if (valor == null || valor === "") return "—";
  if (Array.isArray(valor)) return valor.length ? valor.map(String).join(", ") : "—";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  return String(valor);
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

function selectOpcoes(mapa: Record<string, string>, atual: string | null, incluirVazio: string | null): string {
  const vazio = incluirVazio ? `<option value="">${escapeHtml(incluirVazio)}</option>` : "";
  const opcoes = Object.entries(mapa)
    .map(
      ([valor, label]) =>
        `<option value="${escapeHtml(valor)}"${valor === atual ? " selected" : ""}>${escapeHtml(label)}</option>`
    )
    .join("");
  return vazio + opcoes;
}

function blocoDadosColetados(dados: Record<string, unknown> | null): string {
  if (!dados) return "";
  const entradas = Object.entries(dados).filter(
    ([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0)
  );
  if (entradas.length === 0) return "";
  return `<div class="detalhes">${entradas
    .map(([k, v]) => `<span><b>${escapeHtml(k.replace(/_/g, " "))}:</b> ${escapeHtml(formatarValor(v))}</span>`)
    .join("")}</div>`;
}

function blocoNotas(lead: LeadPainel): string {
  if (lead.notas.length === 0) return '<p class="vazio">Nenhuma observação registrada.</p>';
  return `<ul class="notas">${lead.notas
    .map(
      (n) =>
        `<li><span class="meta">${formatarData(n.created_at)}${n.autor ? " · " + escapeHtml(n.autor) : ""}</span>${escapeHtml(n.texto)}</li>`
    )
    .join("")}</ul>`;
}

function cardLead(lead: LeadPainel, ehAdmin: boolean): string {
  const emHandoff = lead.em_atendimento_humano === true;

  // A comparação sugerido vs confirmado é o único sinal disponível de se as
  // regras de roteamento da Seção 3 acertam na prática.
  const divergenciaUnidade =
    lead.unidade_confirmada && lead.unidade_recomendada && lead.unidade_confirmada !== lead.unidade_recomendada;

  const resumoEvento = [
    lead.data_evento ? `Data ${lead.data_evento}` : null,
    lead.numero_convidados != null ? `${lead.numero_convidados} convidados` : null,
    lead.orcamento_mencionado != null ? `R$ ${Number(lead.orcamento_mencionado).toLocaleString("pt-BR")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return `
<article class="card" data-lead="${escapeHtml(lead.id)}">
  <header>
    <div>
      <h2>${escapeHtml(lead.nome_cliente ?? "Cliente sem nome")}</h2>
      <p class="contato">${escapeHtml(lead.whatsapp_number)}${lead.email ? " · " + escapeHtml(lead.email) : ""}
        <button class="editar-contato" type="button" title="Editar nome e telefone">✏️</button></p>
      <div class="form-contato" hidden>
        <input type="text" data-edit="nome_cliente" placeholder="Nome do cliente" maxlength="200"
               value="${escapeHtml(lead.nome_cliente ?? "")}">
        <input type="text" data-edit="whatsapp_number" placeholder="+5522999999999"
               value="${escapeHtml(lead.whatsapp_number)}">
        <button class="salvar-contato" type="button">Salvar</button>
        <button class="cancelar-contato sec" type="button">Cancelar</button>
      </div>
    </div>
    <span class="badge ${emHandoff ? "humano" : "bot"}">${emHandoff ? "● atendimento humano" : "bot ativo"}</span>
  </header>

  <div class="info">
    <span><b>Tipo:</b> ${escapeHtml(rotular(LABEL_RAMO, lead.ramo ?? lead.tipo_evento))}</span>
    <span><b>Unidade sugerida pela IA:</b> ${escapeHtml(rotular(LABEL_UNIDADE, lead.unidade_recomendada))}</span>
    ${resumoEvento ? `<span><b>Evento:</b> ${escapeHtml(resumoEvento)}</span>` : ""}
    <span><b>1º contato:</b> ${formatarData(lead.created_at)}</span>
    <span><b>Última msg do cliente:</b> ${formatarData(lead.ultima_interacao)}</span>
    ${lead.tags?.length ? `<span><b>Tags:</b> ${escapeHtml(lead.tags.join(", "))}</span>` : ""}
  </div>

  ${lead.resumo_pedido ? `<p class="resumo">${escapeHtml(lead.resumo_pedido)}</p>` : ""}
  ${blocoDadosColetados(lead.dados_coletados)}

  <div class="acoes">
    <label>Etapa do funil
      <select data-campo="status">${selectOpcoes(LABEL_STATUS, lead.status, null)}</select>
    </label>
    <label>Unidade confirmada
      <select data-campo="unidade_confirmada">${selectOpcoes(LABEL_UNIDADE, lead.unidade_confirmada, "não confirmada")}</select>
    </label>
    <a class="conversa" href="/painel/leads/${escapeHtml(lead.id)}/conversa">💬 Conversa</a>
    ${emHandoff ? '<button class="devolver" type="button">Devolver ao bot</button>' : ""}
    ${ehAdmin ? `<button class="apagar" type="button" data-nome="${escapeHtml(lead.nome_cliente ?? lead.whatsapp_number)}">🗑 Apagar</button>` : ""}
  </div>
  ${divergenciaUnidade ? '<p class="aviso-linha">A unidade confirmada difere da sugerida pela IA.</p>' : ""}

  <div class="nota-nova">
    <input type="text" placeholder="Anotar algo sobre este lead..." maxlength="2000">
    <button class="salvar-nota" type="button">Salvar</button>
  </div>
  <p class="feedback"></p>
  ${blocoNotas(lead)}
</article>`;
}

/**
 * Painel de acompanhamento e ação (Seção 7 + estágio "frontend").
 *
 * Server-rendered, sem framework: o JS abaixo só chama a API de escrita
 * (routes/leadsApi.ts). Cards em vez de tabela porque com quatro controles por
 * lead uma tabela de dez colunas fica impraticável.
 *
 * A autenticação é a sessão da própria página (cookie HttpOnly), enviada pelo
 * navegador nas chamadas fetch — não há token separado a gerenciar no JS.
 */
export function renderizarPainelHtml(leads: LeadPainel[], autor: Autor): string {
  const emAtendimento = leads.filter((l) => l.em_atendimento_humano === true).length;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Painel — Casa da Árvore</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; margin: 0; padding: 20px;
           background: #f4f6f4; color: #222; }
    h1 { color: #2f5233; margin: 0 0 4px; font-size: 22px; }
    .sub { color: #666; font-size: 14px; margin: 0 0 20px; }
    .card { background: #fff; border: 1px solid #e0e4e0; border-radius: 10px; padding: 16px; margin-bottom: 14px;
            max-width: 900px; }
    .card header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
                   border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 10px; }
    .card h2 { margin: 0; font-size: 17px; color: #2f5233; }
    .contato { margin: 2px 0 0; font-size: 13px; color: #666; }
    .badge { font-size: 12px; padding: 4px 10px; border-radius: 20px; white-space: nowrap; }
    .badge.humano { background: #fdecea; color: #b00020; font-weight: bold; }
    .badge.bot { background: #e8f0e9; color: #2f5233; }
    .info { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; margin-bottom: 8px; }
    .resumo { font-size: 14px; background: #f7f9f7; padding: 8px 10px; border-radius: 6px; margin: 8px 0; }
    .detalhes { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; color: #555; margin-bottom: 10px; }
    .acoes { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; border-top: 1px solid #eee;
             padding-top: 12px; }
    .acoes label { display: flex; flex-direction: column; font-size: 12px; color: #555; gap: 4px; }
    select, input[type=text] { padding: 7px 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px;
                               font-family: inherit; }
    button { padding: 8px 14px; border: 0; border-radius: 6px; background: #2f5233; color: #fff; font-size: 14px;
             cursor: pointer; font-family: inherit; }
    button:hover { background: #3d6b42; }
    button.devolver { background: #b00020; }
    button.devolver:hover { background: #c62828; }
    button.apagar { background: #fff; color: #b00020; border: 1px solid #b00020; }
    button.apagar:hover { background: #fdecea; }
    button.editar-contato { background: none; border: 0; padding: 0 4px; font-size: 13px; cursor: pointer; }
    button.editar-contato:hover { background: none; }
    .form-contato { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .form-contato input { font-size: 13px; }
    button.sec { background: #fff; color: #555; border: 1px solid #ccc; }
    button.sec:hover { background: #f0f0f0; }
    a.conversa { display: inline-block; padding: 8px 14px; border-radius: 6px; background: #fff; color: #2f5233;
                 border: 1px solid #2f5233; font-size: 14px; text-decoration: none; }
    a.conversa:hover { background: #eef2ee; }
    .nota-nova { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .nota-nova input[type=text]:first-child { flex: 1; min-width: 200px; }
    .nota-nova .autor { width: 130px; }
    .notas { list-style: none; padding: 0; margin: 10px 0 0; font-size: 13px; }
    .notas li { border-left: 3px solid #d7e0d8; padding: 4px 0 4px 10px; margin-bottom: 6px; }
    .notas .meta { display: block; color: #888; font-size: 11px; }
    .vazio { color: #999; font-size: 13px; margin: 10px 0 0; }
    .feedback { font-size: 13px; margin: 8px 0 0; min-height: 18px; }
    .feedback.ok { color: #2f5233; }
    .feedback.erro { color: #b00020; }
    .aviso-linha { font-size: 12px; color: #8a6d00; background: #fff8e1; padding: 6px 8px; border-radius: 5px;
                   margin: 8px 0 0; }
    .topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; max-width: 900px;
            flex-wrap: wrap; }
    .usuario { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #555; }
    .usuario form { margin: 0; }
    button.sair, a.sair { background: #fff; color: #2f5233; border: 1px solid #cfd8d0; padding: 6px 12px;
                          font-size: 13px; border-radius: 6px; text-decoration: none; display: inline-block; }
    button.sair:hover, a.sair:hover { background: #eef2ee; }
    .aviso-bootstrap { background: #fff8e1; color: #8a6d00; border: 1px solid #ffe69c; padding: 12px;
                       border-radius: 8px; font-size: 13px; max-width: 900px; margin-bottom: 16px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="topo">
    <div>
      <h1>Painel — Casa da Árvore</h1>
      <p class="sub">${leads.length} lead(s) · ${emAtendimento} em atendimento humano · mostrando os 200 mais recentes</p>
    </div>
    <div class="usuario">
      ${
        autor.papel === "admin"
          ? `<a class="sair" href="/painel/midias">Mídias</a>
             <a class="sair" href="/painel/configuracoes">Configurações</a>
             <a class="sair" href="/painel/usuarios">Usuários</a>`
          : ""
      }
      <span>${escapeHtml(autor.nome)}</span>
      <form method="post" action="/logout"><button type="submit" class="sair">Sair</button></form>
    </div>
  </div>
  ${
    autor.compartilhado
      ? `<div class="aviso-bootstrap"><b>Você entrou pela credencial compartilhada.</b>
         Nesse modo não há como registrar quem fez cada ação. Crie um usuário com
         <code>npm run criar-usuario</code> — a partir do primeiro usuário, esta credencial deixa de funcionar.</div>`
      : ""
  }
  ${leads.map((l) => cardLead(l, autor.papel === "admin")).join("\n") || "<p>Nenhum lead encontrado.</p>"}

<script>
function feedback(card, texto, ok) {
  var el = card.querySelector(".feedback");
  el.textContent = texto;
  el.className = "feedback " + (ok ? "ok" : "erro");
}

// location.origin nunca inclui usuario:senha, diferente de uma URL relativa
// resolvida contra um documento aberto como http://user:pass@host/painel — o
// fetch() recusa URL com credenciais e os botoes quebrariam silenciosamente.
// Abrir painel Basic Auth com credenciais na URL e forma comum de compartilhar
// o link, entao vale nao depender disso.
function apiUrl(caminho) {
  return location.origin + caminho;
}

async function patchLead(card, corpo) {
  var id = card.dataset.lead;
  var resp = await fetch(apiUrl("/api/leads/" + id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo)
  });
  if (!resp.ok) {
    var detalhe = await resp.text();
    throw new Error("HTTP " + resp.status + " " + detalhe);
  }
  return resp.json();
}

document.querySelectorAll(".card").forEach(function (card) {
  card.querySelectorAll("select[data-campo]").forEach(function (sel) {
    sel.addEventListener("change", async function () {
      var campo = sel.dataset.campo;
      // Select de unidade tem opção vazia ("não confirmada"); a API não aceita
      // string vazia, então tratamos como "nada a enviar".
      if (sel.value === "") { feedback(card, "Escolha uma unidade para confirmar.", false); return; }
      var corpo = {}; corpo[campo] = sel.value;
      try {
        await patchLead(card, corpo);
        feedback(card, "Salvo.", true);
      } catch (e) {
        feedback(card, "Falha ao salvar: " + e.message, false);
      }
    });
  });

  var btnDevolver = card.querySelector("button.devolver");
  if (btnDevolver) {
    btnDevolver.addEventListener("click", async function () {
      if (!confirm("Devolver esta conversa ao bot? Ele volta a responder este cliente automaticamente.")) return;
      btnDevolver.disabled = true;
      try {
        await patchLead(card, { devolver_ao_bot: true });
        location.reload();
      } catch (e) {
        btnDevolver.disabled = false;
        feedback(card, "Falha ao devolver ao bot: " + e.message, false);
      }
    });
  }

  var btnEditar = card.querySelector("button.editar-contato");
  var formContato = card.querySelector(".form-contato");
  if (btnEditar && formContato) {
    btnEditar.addEventListener("click", function () { formContato.hidden = !formContato.hidden; });
    formContato.querySelector("button.cancelar-contato").addEventListener("click", function () {
      formContato.hidden = true;
    });
    formContato.querySelector("button.salvar-contato").addEventListener("click", async function () {
      var nome = formContato.querySelector('[data-edit="nome_cliente"]').value.trim();
      var telefone = formContato.querySelector('[data-edit="whatsapp_number"]').value.trim();
      if (!nome && !telefone) { feedback(card, "Preencha nome ou telefone.", false); return; }
      var corpo = {};
      if (nome) corpo.nome_cliente = nome;
      if (telefone) corpo.whatsapp_number = telefone;
      try {
        await patchLead(card, corpo);
        location.reload();
      } catch (e) {
        feedback(card, "Falha ao salvar contato: " + e.message, false);
      }
    });
  }

  var btnApagar = card.querySelector("button.apagar");
  if (btnApagar) {
    btnApagar.addEventListener("click", async function () {
      var nome = btnApagar.dataset.nome;
      if (!confirm("Apagar o lead \\"" + nome + "\\"?\\n\\nIsso remove TODO o histórico (conversa, notas, atendimentos) e não tem volta. O número volta a ser tratado como cliente novo.")) return;
      if (!confirm("Tem certeza? Última confirmação antes de apagar \\"" + nome + "\\" de vez.")) return;
      btnApagar.disabled = true;
      try {
        var resp = await fetch(apiUrl("/api/leads/" + card.dataset.lead), { method: "DELETE" });
        if (!resp.ok) throw new Error("HTTP " + resp.status + " " + (await resp.text()));
        card.remove();
      } catch (e) {
        btnApagar.disabled = false;
        feedback(card, "Falha ao apagar: " + e.message, false);
      }
    });
  }

  var btnNota = card.querySelector("button.salvar-nota");
  btnNota.addEventListener("click", async function () {
    var texto = card.querySelector(".nota-nova input[type=text]").value.trim();
    if (!texto) { feedback(card, "Escreva a observação antes de salvar.", false); return; }
    btnNota.disabled = true;
    try {
      var resp = await fetch(apiUrl("/api/leads/" + card.dataset.lead + "/notas"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto })
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status + " " + (await resp.text()));
      location.reload();
    } catch (e) {
      btnNota.disabled = false;
      feedback(card, "Falha ao salvar nota: " + e.message, false);
    }
  });
});
</script>
</body>
</html>`;
}
