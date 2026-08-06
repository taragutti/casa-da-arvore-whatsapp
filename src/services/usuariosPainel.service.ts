import { Autor } from "../middleware/auth";
import { UsuarioComUnidades } from "../repositories/usuarios.repo";
import { UnidadeRecomendada } from "./routing.service";
import { escapeHtml } from "../utils/html";

const LABEL_UNIDADE: Record<UnidadeRecomendada, string> = {
  casa_da_arvore: "Casa da Árvore",
  park_lagos: "Park Lagos",
  shopping_park_lagos: "Shopping Park Lagos",
  casarao: "Casarão",
  casa_por_do_sol: "Casa Pôr do Sol",
};

const UNIDADES = Object.keys(LABEL_UNIDADE) as UnidadeRecomendada[];

function checkboxesUnidade(prefixo: string, marcadas: UnidadeRecomendada[]): string {
  return UNIDADES.map(
    (u) => `
      <label class="check-unidade">
        <input type="checkbox" name="${prefixo}" value="${u}" ${marcadas.includes(u) ? "checked" : ""}>
        ${escapeHtml(LABEL_UNIDADE[u])}
      </label>`
  ).join("");
}

function linhaUsuario(u: UsuarioComUnidades, autor: Autor): string {
  const ehVoceMesmo = u.id === autor.usuarioId;
  // Papel/unidades/ativo da própria conta ficam travados por aqui — mudar o
  // próprio papel ou se autodesativar no meio do uso é o tipo de ação que
  // merece um caminho mais deliberado que um clique nesta tela. Nome e
  // e-mail continuam editáveis pra qualquer linha, inclusive a sua.
  const travarPermissao = ehVoceMesmo ? "disabled title=\"Não é possível alterar a própria permissão por aqui.\"" : "";

  return `
  <tr class="linha-usuario" data-id="${u.id}">
    <td>
      <input type="text" class="nome" value="${escapeHtml(u.nome)}">${ehVoceMesmo ? ' <span class="voce">(você)</span>' : ""}<br>
      <input type="email" class="email" value="${escapeHtml(u.email)}">
    </td>
    <td>
      <select class="papel" ${travarPermissao}>
        <option value="admin" ${u.papel === "admin" ? "selected" : ""}>Admin</option>
        <option value="atendente" ${u.papel === "atendente" ? "selected" : ""}>Atendente</option>
      </select>
    </td>
    <td class="celula-unidades" style="${u.papel === "atendente" ? "" : "display:none"}">
      ${checkboxesUnidade("unidade", u.unidades)}
    </td>
    <td>
      <label class="check-ativo">
        <input type="checkbox" class="ativo" ${u.ativo ? "checked" : ""} ${travarPermissao}>
        ${u.ativo ? "Ativo" : "Desativado"}
      </label>
    </td>
    <td class="rodape-linha">
      <span class="ultimo-login">${
        u.ultimo_login_em
          ? escapeHtml(new Date(u.ultimo_login_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }))
          : "nunca entrou"
      }</span>
      <button type="button" class="salvar-linha">Salvar</button>
      <button type="button" class="remover-linha" ${
        ehVoceMesmo ? "disabled title=\"Não é possível excluir a própria conta.\"" : ""
      }>Remover</button>
      <span class="status-linha"></span>
    </td>
  </tr>`;
}

export function renderizarUsuariosHtml(usuarios: UsuarioComUnidades[], autor: Autor): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Usuários — Casa da Árvore</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; margin: 0; padding: 20px;
           background: #f4f6f4; color: #222; }
    h1 { color: #2f5233; margin: 0 0 4px; font-size: 22px; }
    h2 { color: #2f5233; font-size: 16px; margin: 0 0 4px; }
    .sub { color: #666; font-size: 14px; margin: 0 0 20px; }
    .topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; max-width: 980px;
            flex-wrap: wrap; }
    .usuario { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #555; }
    .usuario form { margin: 0; }
    .conteudo { max-width: 980px; }
    .bloco { background: #fff; border: 1px solid #e6eae6; border-radius: 10px; padding: 18px; margin-bottom: 16px; }
    .bloco > .desc { color: #666; font-size: 13px; margin: 0 0 14px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; color: #33502f; font-size: 12px; padding: 6px 8px; border-bottom: 2px solid #e6eae6; }
    td { padding: 8px; border-bottom: 1px solid #eef1ee; vertical-align: top; }
    .email { color: #777; font-size: 12px; }
    .voce { color: #888; font-weight: 400; font-size: 12px; }
    select, input[type=email], input[type=text], input[type=password] {
      padding: 6px 8px; border: 1px solid #cfd8d0; border-radius: 6px; font-size: 13px; font-family: inherit;
    }
    .check-unidade, .check-ativo { display: block; font-size: 12px; font-weight: 400; white-space: nowrap; }
    .check-unidade input, .check-ativo input { margin-right: 4px; }
    .celula-unidades { min-width: 160px; }
    .rodape-linha { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; white-space: nowrap; }
    .ultimo-login { color: #888; font-size: 11px; }
    button { padding: 7px 14px; border: 0; border-radius: 6px; background: #2f5233; color: #fff; font-size: 13px;
             cursor: pointer; font-family: inherit; }
    button:hover { background: #3d6b42; }
    button:disabled { opacity: .5; cursor: default; }
    button.remover-linha { background: #fff; color: #a12; border: 1px solid #e6b8b8; }
    button.remover-linha:hover { background: #fdeeee; }
    td .nome, td .email { width: 100%; margin: 2px 0; }
    button.sair, a.sair { background: #fff; color: #2f5233; border: 1px solid #cfd8d0; padding: 6px 12px;
                          font-size: 13px; border-radius: 6px; text-decoration: none; display: inline-block; }
    .grade-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; align-items: end; }
    .campo label { display: block; font-size: 12px; font-weight: 600; color: #33502f; margin-bottom: 4px; }
    .campo input, .campo select { width: 100%; }
    .status-linha { font-size: 12px; }
    .status-linha.ok { color: #2f6b33; }
    .status-linha.erro { color: #a12; }
    .aviso { padding: 12px; border-radius: 8px; font-size: 13px; line-height: 1.5; margin-bottom: 16px;
             background: #eef3ee; color: #33502f; border: 1px solid #d5e2d6; }
  </style>
</head>
<body>
  <div class="topo">
    <div>
      <h1>Usuários</h1>
      <p class="sub">${usuarios.length} conta(s) — quem administra o sistema e quem só atende leads</p>
    </div>
    <div class="usuario">
      <a class="sair" href="/painel">← Leads</a>
      <a class="sair" href="/painel/midias">Mídias</a>
      <a class="sair" href="/painel/configuracoes">Configurações</a>
      <span>${escapeHtml(autor.nome)}</span>
      <form method="post" action="/logout"><button type="submit" class="sair">Sair</button></form>
    </div>
  </div>

  <div class="conteudo">
    <div class="aviso">
      <b>Admin</b> tem acesso total (configurações, mídia, usuários) e vê todos os leads. <b>Atendente</b> só vê
      leads da(s) unidade(s) marcada(s) abaixo — lead sem unidade decidida ainda continua aparecendo pra todo
      atendente, até a qualificação chegar lá.
    </div>

    <div class="bloco">
      <h2>Criar usuário</h2>
      <div class="grade-form">
        <div class="campo"><label for="novo_nome">Nome</label><input type="text" id="novo_nome"></div>
        <div class="campo"><label for="novo_email">E-mail</label><input type="email" id="novo_email"></div>
        <div class="campo"><label for="novo_senha">Senha (mín. 10 caracteres)</label><input type="password" id="novo_senha"></div>
        <div class="campo">
          <label for="novo_papel">Papel</label>
          <select id="novo_papel">
            <option value="atendente">Atendente</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div class="campo" id="novo_unidades_wrap">
          <label>Unidades</label>
          ${checkboxesUnidade("nova_unidade", [])}
        </div>
        <div class="campo"><button type="button" id="criar">Criar</button></div>
      </div>
      <p class="status-linha" id="status_criar"></p>
    </div>

    <div class="bloco">
      <h2>Contas existentes</h2>
      <table>
        <thead>
          <tr><th>Nome</th><th>Papel</th><th>Unidades (se atendente)</th><th>Status</th><th></th></tr>
        </thead>
        <tbody id="corpo_usuarios">
          ${usuarios.map((u) => linhaUsuario(u, autor)).join("")}
        </tbody>
      </table>
    </div>
  </div>

<script>
(function () {
  var base = location.origin;

  function unidadesMarcadas(escopo, nomeCampo) {
    return Array.prototype.slice
      .call(escopo.querySelectorAll('input[name="' + nomeCampo + '"]:checked'))
      .map(function (el) { return el.value; });
  }

  // Alterna a coluna de unidades conforme o papel escolhido, tanto no
  // formulário de criação quanto em cada linha já existente.
  function ligarAlternanciaPapel(select, alvoUnidades) {
    select.addEventListener("change", function () {
      alvoUnidades.style.display = select.value === "atendente" ? "" : "none";
    });
  }
  ligarAlternanciaPapel(document.getElementById("novo_papel"), document.getElementById("novo_unidades_wrap"));
  document.querySelectorAll(".linha-usuario").forEach(function (linha) {
    ligarAlternanciaPapel(linha.querySelector(".papel"), linha.querySelector(".celula-unidades"));
  });

  document.getElementById("criar").addEventListener("click", async function () {
    var status = document.getElementById("status_criar");
    var corpo = {
      nome: document.getElementById("novo_nome").value.trim(),
      email: document.getElementById("novo_email").value.trim(),
      senha: document.getElementById("novo_senha").value,
      papel: document.getElementById("novo_papel").value,
      unidades: unidadesMarcadas(document, "nova_unidade")
    };
    status.textContent = "Criando...";
    status.className = "status-linha";
    try {
      var resp = await fetch(base + "/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo)
      });
      var dados = await resp.json().catch(function () { return {}; });
      if (!resp.ok) {
        status.textContent = dados.erro || "Não foi possível criar.";
        status.className = "status-linha erro";
        return;
      }
      status.textContent = "Criado. Recarregando...";
      status.className = "status-linha ok";
      location.reload();
    } catch (e) {
      status.textContent = "Falha de rede.";
      status.className = "status-linha erro";
    }
  });

  document.querySelectorAll(".linha-usuario").forEach(function (linha) {
    var salvar = linha.querySelector(".salvar-linha");
    var remover = linha.querySelector(".remover-linha");
    var status = linha.querySelector(".status-linha");

    salvar.addEventListener("click", async function () {
      var corpo = {
        nome: linha.querySelector(".nome").value.trim(),
        email: linha.querySelector(".email").value.trim(),
        papel: linha.querySelector(".papel").value,
        ativo: linha.querySelector(".ativo").checked,
        unidades: unidadesMarcadas(linha, "unidade")
      };

      salvar.disabled = true;
      status.textContent = "Salvando...";
      status.className = "status-linha";
      try {
        var resp = await fetch(base + "/api/usuarios/" + linha.dataset.id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo)
        });
        var dados = await resp.json().catch(function () { return {}; });
        if (!resp.ok) {
          status.textContent = dados.erro || "Não foi possível salvar.";
          status.className = "status-linha erro";
        } else {
          status.textContent = "Salvo.";
          status.className = "status-linha ok";
        }
      } catch (e) {
        status.textContent = "Falha de rede.";
        status.className = "status-linha erro";
      } finally {
        salvar.disabled = false;
      }
    });

    if (remover) {
      remover.addEventListener("click", async function () {
        var nome = linha.querySelector(".nome").value.trim();
        if (!confirm('Excluir "' + nome + '"? Essa ação não pode ser desfeita.')) return;

        remover.disabled = true;
        status.textContent = "Excluindo...";
        status.className = "status-linha";
        try {
          var resp = await fetch(base + "/api/usuarios/" + linha.dataset.id, { method: "DELETE" });
          var dados = await resp.json().catch(function () { return {}; });
          if (!resp.ok) {
            status.textContent = dados.erro || "Não foi possível excluir.";
            status.className = "status-linha erro";
            remover.disabled = false;
            return;
          }
          linha.remove();
        } catch (e) {
          status.textContent = "Falha de rede.";
          status.className = "status-linha erro";
          remover.disabled = false;
        }
      });
    }
  });
})();
</script>
</body>
</html>`;
}
