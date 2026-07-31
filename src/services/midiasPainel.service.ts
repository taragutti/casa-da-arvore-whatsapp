import { Autor } from "../middleware/auth";
import { ETAPAS_MIDIA, MediaItemAdmin, TipoMidia, CategoriaMidia } from "../repositories/mediaLibrary.repo";
import { UnidadeRecomendada } from "../services/routing.service";
import { escapeHtml } from "../utils/html";

const LABEL_UNIDADE: Record<UnidadeRecomendada, string> = {
  casa_da_arvore: "Casa da Árvore",
  park_lagos: "Park Lagos",
  shopping_park_lagos: "Shopping Park Lagos",
  casarao: "Casarão",
  casa_por_do_sol: "Casa Pôr do Sol",
};

const LABEL_PERFIL: Record<string, string> = {
  infantil_pequeno: "infantil até 100",
  infantil_grande: "infantil 100+",
  destination: "destination wedding",
};

const ORDEM_UNIDADES = Object.keys(LABEL_UNIDADE) as UnidadeRecomendada[];
const ETAPAS = [1, 2, 3, 4] as const;

/**
 * Unidades omitidas do mapa de cobertura, a pedido de quem opera: material
 * ainda não vai ser cadastrado para elas, e a linha vermelha permanente virava
 * ruído sem ação possível.
 *
 * Esconde SÓ o mapa. Deliberadamente não mexe em nada de comportamento:
 *
 * - o roteamento continua mandando leads para estas unidades (Park Lagos recebe
 *   festa infantil de até 50 convidados, por exemplo). Elas simplesmente não
 *   têm mídia para enviar — o bot segue respondendo, o handoff dispara e o
 *   vendedor é avisado normalmente;
 * - seguem selecionáveis no formulário de envio, para poderem ser populadas a
 *   qualquer momento sem precisar de deploy.
 *
 * Esvaziar esta lista devolve as linhas ao mapa.
 */
const UNIDADES_OCULTAS_NO_MAPA: readonly UnidadeRecomendada[] = ["park_lagos"];

const UNIDADES_NO_MAPA = ORDEM_UNIDADES.filter((u) => !UNIDADES_OCULTAS_NO_MAPA.includes(u));

export interface ContagemEtapa {
  unidade: UnidadeRecomendada;
  tipo: TipoMidia;
  categoria: CategoriaMidia;
  total: number;
}

/**
 * Nota de pé do mapa. Unidade escondida sem aviso nenhum seria pior que a linha
 * vermelha: ninguém lembraria que ela existe, e leads continuariam chegando
 * nela sem mídia — sem nada na tela sugerindo o porquê.
 */
function notaUnidadesOcultas(): string {
  if (UNIDADES_OCULTAS_NO_MAPA.length === 0) return "";
  const nomes = UNIDADES_OCULTAS_NO_MAPA.map((u) => LABEL_UNIDADE[u]).join(", ");
  return ` Fora do mapa por opção: ${escapeHtml(nomes)} — ainda recebe leads, mas sem mídia para enviar.`;
}

function totalDaEtapa(contagens: ContagemEtapa[], unidade: UnidadeRecomendada, etapa: 1 | 2 | 3 | 4): number {
  const { tipo, categoria } = ETAPAS_MIDIA[etapa];
  return contagens.find((c) => c.unidade === unidade && c.tipo === tipo && c.categoria === categoria)?.total ?? 0;
}

/**
 * Mapa de cobertura: linhas por unidade, colunas por etapa da régua.
 *
 * É o bloco mais importante da tela: mostra onde falta material, informação que
 * uma lista simples de arquivos esconderia.
 *
 * Etapa vazia NÃO interrompe mais a régua — o motor pula para a etapa seguinte
 * que tenha material (ver mediaEngine.service.ts). Então o vermelho aqui
 * significa "esta etapa não será enviada", e não mais "a régua para aqui".
 */
function mapaCobertura(contagens: ContagemEtapa[]): string {
  const cabecalho = ETAPAS.map((e) => `<th>Etapa ${e}</th>`).join("");

  const linhas = UNIDADES_NO_MAPA.map((unidade) => {
    const celulas = ETAPAS.map((etapa) => {
      const total = totalDaEtapa(contagens, unidade, etapa);
      const esperado = ETAPAS_MIDIA[etapa].quantidade;

      // Três estados, não dois: "vazio" interrompe a régua; "parcial" (etapa 3
      // com 1 ou 2 fotos em vez de 3–4) funciona, mas entrega menos do que a
      // Seção 4 pede — merece atenção sem soar como erro.
      const estado = total === 0 ? "vazio" : total < esperado ? "parcial" : "ok";
      const rotulo = total === 0 ? "—" : esperado > 1 ? `${total}/${esperado}` : String(total);
      return `<td class="cel ${estado}">${rotulo}</td>`;
    }).join("");

    const completa = ETAPAS.every((e) => totalDaEtapa(contagens, unidade, e) > 0);
    return `<tr><th class="unidade">${escapeHtml(LABEL_UNIDADE[unidade])}${
      completa ? "" : ' <span class="alerta-inline">régua incompleta</span>'
    }</th>${celulas}</tr>`;
  }).join("");

  return `
<table class="cobertura">
  <thead><tr><th>Unidade</th>${cabecalho}</tr></thead>
  <tbody>${linhas}</tbody>
</table>`;
}

function previa(item: MediaItemAdmin): string {
  const url = escapeHtml(item.url);
  if (item.tipo === "foto") return `<img src="${url}" alt="${escapeHtml(item.codigo)}" loading="lazy">`;
  if (item.tipo === "video") return `<video src="${url}" preload="metadata" muted></video>`;
  return `<a class="previa-doc" href="${url}" target="_blank" rel="noopener">abrir PDF</a>`;
}

function etapaDoItem(item: MediaItemAdmin): number | null {
  const encontrada = ETAPAS.find(
    (e) => ETAPAS_MIDIA[e].tipo === item.tipo && ETAPAS_MIDIA[e].categoria === item.categoria
  );
  return encontrada ?? null;
}

function cardMidia(item: MediaItemAdmin): string {
  const etapa = etapaDoItem(item);
  const perfil = item.perfil_lead ? (LABEL_PERFIL[item.perfil_lead] ?? item.perfil_lead) : "todos os perfis";

  return `
<article class="midia ${item.ativo ? "" : "inativa"}" data-codigo="${escapeHtml(item.codigo)}">
  <div class="thumb">${previa(item)}</div>
  <div class="meta">
    <b>${escapeHtml(LABEL_UNIDADE[item.unidade])}</b>
    <span>${etapa ? `Etapa ${etapa}` : `${escapeHtml(item.tipo)} / ${escapeHtml(item.categoria)}`} · ${escapeHtml(perfil)}</span>
    <code>${escapeHtml(item.codigo)}</code>
  </div>
  <div class="midia-acoes">
    <label class="switch">
      <input type="checkbox" data-acao="ativo" ${item.ativo ? "checked" : ""}>
      ${item.ativo ? "ativa" : "desativada"}
    </label>
    <button type="button" class="remover" data-acao="remover">Remover</button>
  </div>
</article>`;
}

function opcoesUnidade(): string {
  return ORDEM_UNIDADES.map((u) => `<option value="${u}">${escapeHtml(LABEL_UNIDADE[u])}</option>`).join("");
}

function opcoesEtapa(): string {
  return ETAPAS.map((e) => `<option value="${e}">${escapeHtml(ETAPAS_MIDIA[e].rotulo)}</option>`).join("");
}

/**
 * Tela de gestão da biblioteca de mídia (Seção 4).
 *
 * Mesmo padrão do painel de leads: server-rendered, sem framework, JS só
 * chamando a API (routes/midiasApi.ts). O upload manda o File como corpo da
 * requisição com o Content-Type do arquivo — é o que a API espera, e evita
 * multipart.
 */
export function renderizarPainelMidiasHtml(
  itens: MediaItemAdmin[],
  contagens: ContagemEtapa[],
  autor: Autor
): string {
  const ativas = itens.filter((i) => i.ativo).length;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mídias — Casa da Árvore</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; margin: 0; padding: 20px;
           background: #f4f6f4; color: #222; }
    h1 { color: #2f5233; margin: 0 0 4px; font-size: 22px; }
    h2 { color: #2f5233; font-size: 16px; margin: 24px 0 10px; }
    .sub { color: #666; font-size: 14px; margin: 0 0 20px; }
    .topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; max-width: 1000px;
            flex-wrap: wrap; }
    .usuario { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #555; }
    .usuario form { margin: 0; }
    .conteudo { max-width: 1000px; }
    button { padding: 8px 14px; border: 0; border-radius: 6px; background: #2f5233; color: #fff; font-size: 14px;
             cursor: pointer; font-family: inherit; }
    button:hover { background: #3d6b42; }
    button:disabled { opacity: .6; cursor: default; }
    button.sair, a.voltar { background: #fff; color: #2f5233; border: 1px solid #cfd8d0; padding: 6px 12px;
             font-size: 13px; border-radius: 6px; text-decoration: none; display: inline-block; }
    button.sair:hover, a.voltar:hover { background: #eef2ee; }
    select, input[type=file] { padding: 7px 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px;
                               font-family: inherit; background: #fff; }
    .bloco { background: #fff; border: 1px solid #e0e4e0; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
    table.cobertura { border-collapse: collapse; width: 100%; font-size: 13px; }
    table.cobertura th, table.cobertura td { border: 1px solid #e6eae6; padding: 8px 10px; text-align: center; }
    table.cobertura thead th { background: #f0f4f0; color: #2f5233; font-weight: 600; }
    table.cobertura th.unidade { text-align: left; font-weight: 600; white-space: nowrap; }
    .cel { font-weight: 600; }
    .cel.ok { background: #e8f0e9; color: #2f5233; }
    .cel.parcial { background: #fff8e1; color: #8a6d00; }
    .cel.vazio { background: #fdecea; color: #b00020; }
    .alerta-inline { font-weight: 400; font-size: 11px; color: #b00020; }
    .legenda { font-size: 12px; color: #666; margin: 10px 0 0; }
    form.upload { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
    form.upload label { display: flex; flex-direction: column; font-size: 12px; color: #555; gap: 4px; }
    .grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
    .midia { background: #fff; border: 1px solid #e0e4e0; border-radius: 10px; padding: 10px; display: flex;
             flex-direction: column; gap: 8px; }
    .midia.inativa { opacity: .55; }
    .thumb { height: 120px; background: #f0f2f0; border-radius: 6px; display: flex; align-items: center;
             justify-content: center; overflow: hidden; }
    .thumb img, .thumb video { width: 100%; height: 100%; object-fit: cover; }
    .previa-doc { font-size: 13px; color: #2f5233; }
    .midia .meta { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: #555; }
    .midia .meta b { font-size: 13px; color: #222; }
    .midia code { font-size: 10px; color: #888; }
    .midia-acoes { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .switch { font-size: 12px; color: #555; display: flex; align-items: center; gap: 5px; }
    button.remover { background: #fff; color: #b00020; border: 1px solid #f0c7c2; padding: 5px 10px; font-size: 12px; }
    button.remover:hover { background: #fdecea; }
    .feedback { font-size: 13px; margin: 10px 0 0; min-height: 18px; }
    .feedback.ok { color: #2f5233; }
    .feedback.erro { color: #b00020; }
    .vazio-lista { color: #999; font-size: 13px; }
    .nota { background: #f7f9f7; border-left: 3px solid #d7e0d8; padding: 10px 12px; font-size: 13px;
            color: #555; line-height: 1.5; border-radius: 4px; margin: 0 0 16px; }
    .aviso-bootstrap { background: #fff8e1; color: #8a6d00; border: 1px solid #ffe69c; padding: 12px;
                       border-radius: 8px; font-size: 13px; margin-bottom: 16px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="topo">
    <div>
      <h1>Biblioteca de mídias</h1>
      <p class="sub">${itens.length} arquivo(s) · ${ativas} ativa(s) · usadas na régua de mídia progressiva</p>
    </div>
    <div class="usuario">
      <a class="voltar" href="/painel">← Leads</a>
      <span>${escapeHtml(autor.nome)}</span>
      <form method="post" action="/logout"><button type="submit" class="sair">Sair</button></form>
    </div>
  </div>

  <div class="conteudo">
  ${
    autor.compartilhado
      ? `<div class="aviso-bootstrap"><b>Você entrou pela credencial compartilhada.</b>
         Nesse modo não há registro de quem enviou cada mídia.</div>`
      : ""
  }

  <p class="nota">A régua é <b>sequencial</b>: o cliente só recebe a etapa 2 depois de reagir bem à etapa 1.
  Etapa sem mídia interrompe a sequência daquela unidade — e é o envio de mídia que reagenda o follow-up.
  Comece pelas unidades que já têm material; unidade sem mídia não gera erro, só não avança.</p>

  <h2>Cobertura por unidade</h2>
  <div class="bloco">
    ${mapaCobertura(contagens)}
    <p class="legenda">Verde: etapa completa · Amarelo: tem mídia, abaixo do recomendado · Vermelho: vazia, esta etapa é pulada.${notaUnidadesOcultas()}</p>
  </div>

  <h2>Enviar mídia</h2>
  <div class="bloco">
    <form class="upload" id="form-upload">
      <label>Unidade
        <select name="unidade" required>${opcoesUnidade()}</select>
      </label>
      <label>Etapa da régua
        <select name="etapa" required>${opcoesEtapa()}</select>
      </label>
      <label>Perfil de lead
        <select name="perfil_lead">
          <option value="geral">Todos os perfis</option>
          <option value="infantil_pequeno">Infantil até 100 convidados</option>
          <option value="infantil_grande">Infantil 100+ convidados</option>
          <option value="destination">Destination wedding</option>
        </select>
      </label>
      <label>Arquivo
        <input type="file" name="arquivo" required accept="image/jpeg,image/png,video/mp4,video/3gpp,application/pdf">
      </label>
      <button type="submit">Enviar</button>
    </form>
    <p class="legenda">Limites do WhatsApp: foto JPG/PNG até 5MB · vídeo MP4 até 16MB · catálogo PDF.
    Vídeo de iPhone (.mov) precisa ser convertido para .mp4. O perfil só afeta a etapa 3, que é a curada por tipo de festa.</p>
    <p class="feedback" id="feedback-upload"></p>
  </div>

  <h2>Mídias cadastradas</h2>
  ${itens.length ? `<div class="grade">${itens.map(cardMidia).join("\n")}</div>` : '<p class="vazio-lista">Nenhuma mídia cadastrada ainda.</p>'}
  </div>

<script>
// Mesma razão do painel de leads: location.origin nunca carrega usuario:senha,
// e o fetch() recusa URL com credenciais.
function apiUrl(caminho) { return location.origin + caminho; }

function mostrar(el, texto, ok) {
  el.textContent = texto;
  el.className = "feedback " + (ok ? "ok" : "erro");
}

async function erroDaResposta(resp) {
  try {
    var dados = await resp.json();
    return dados.erro ? (typeof dados.erro === "string" ? dados.erro : JSON.stringify(dados.erro)) : "HTTP " + resp.status;
  } catch (e) {
    return "HTTP " + resp.status;
  }
}

var form = document.getElementById("form-upload");
var feedbackUpload = document.getElementById("feedback-upload");

form.addEventListener("submit", async function (evento) {
  evento.preventDefault();
  var arquivo = form.arquivo.files[0];
  if (!arquivo) { mostrar(feedbackUpload, "Escolha um arquivo.", false); return; }

  var botao = form.querySelector("button[type=submit]");
  botao.disabled = true;
  mostrar(feedbackUpload, "Enviando " + arquivo.name + "...", true);

  var params = new URLSearchParams({
    unidade: form.unidade.value,
    etapa: form.etapa.value,
    perfil_lead: form.perfil_lead.value
  });

  try {
    // O File vai como corpo puro; o navegador define o Content-Type do arquivo,
    // que e exatamente como a API identifica o formato.
    var resp = await fetch(apiUrl("/api/midias?" + params.toString()), {
      method: "POST",
      headers: { "Content-Type": arquivo.type || "application/octet-stream" },
      body: arquivo
    });
    if (!resp.ok) throw new Error(await erroDaResposta(resp));
    location.reload();
  } catch (e) {
    botao.disabled = false;
    mostrar(feedbackUpload, "Falha no envio: " + e.message, false);
  }
});

document.querySelectorAll(".midia").forEach(function (card) {
  var codigo = card.dataset.codigo;

  card.querySelector("input[data-acao=ativo]").addEventListener("change", async function (evento) {
    var alvo = evento.target;
    alvo.disabled = true;
    try {
      var resp = await fetch(apiUrl("/api/midias/" + codigo), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: alvo.checked })
      });
      if (!resp.ok) throw new Error(await erroDaResposta(resp));
      location.reload();
    } catch (e) {
      alvo.disabled = false;
      alvo.checked = !alvo.checked;
      mostrar(feedbackUpload, "Falha ao alterar " + codigo + ": " + e.message, false);
    }
  });

  card.querySelector("button[data-acao=remover]").addEventListener("click", async function () {
    if (!confirm("Remover esta midia? O arquivo e apagado e o bot deixa de enviar.")) return;
    var botao = card.querySelector("button[data-acao=remover]");
    botao.disabled = true;
    try {
      var resp = await fetch(apiUrl("/api/midias/" + codigo), { method: "DELETE" });
      if (!resp.ok) throw new Error(await erroDaResposta(resp));
      location.reload();
    } catch (e) {
      botao.disabled = false;
      mostrar(feedbackUpload, "Falha ao remover " + codigo + ": " + e.message, false);
    }
  });
});
</script>
</body>
</html>`;
}
