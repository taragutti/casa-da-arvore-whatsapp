import { escapeHtml } from "../utils/html";
import type { Autor } from "../middleware/auth";
import type { LeadParaConversa } from "../repositories/conversa.repo";

/**
 * Tela de conversa do painel (handover, caminho 2): o atendente vê o
 * histórico bot↔cliente e responde dali — a resposta sai pelo número da Tia
 * Bia, então pro cliente é a mesma conversa de sempre.
 *
 * Server-rendered como o resto do painel; o JS só fala com a API
 * (/api/leads/:id/conversa) e re-renderiza a lista. Polling de 5s em vez de
 * SSE/WebSocket de propósito: é a peça mais simples que atende dois
 * vendedores, e o painel inteiro segue sem dependência de infraestrutura
 * nova. Se a operação crescer, este é o ponto a evoluir.
 */
export function renderizarConversaHtml(lead: LeadParaConversa, autor: Autor): string {
  const titulo = lead.nomeCliente ?? "Cliente sem nome";

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Conversa — ${escapeHtml(titulo)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; margin: 0;
           background: #f4f6f4; color: #222; display: flex; flex-direction: column; height: 100vh; }
    .topo { background: #fff; border-bottom: 1px solid #e0e4e0; padding: 12px 20px; display: flex;
            justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .topo h1 { color: #2f5233; margin: 0; font-size: 18px; }
    .contato { color: #666; font-size: 13px; margin: 2px 0 0; }
    .badge { font-size: 12px; padding: 4px 10px; border-radius: 20px; white-space: nowrap; }
    .badge.humano { background: #fdecea; color: #b00020; font-weight: bold; }
    .badge.bot { background: #e8f0e9; color: #2f5233; }
    a.voltar { color: #2f5233; font-size: 13px; text-decoration: none; border: 1px solid #cfd8d0;
               padding: 6px 12px; border-radius: 6px; background: #fff; }
    a.voltar:hover { background: #eef2ee; }
    #mensagens { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column;
                 gap: 8px; max-width: 900px; width: 100%; margin: 0 auto; }
    .msg { max-width: 75%; padding: 8px 12px; border-radius: 12px; font-size: 14px; white-space: pre-wrap;
           word-break: break-word; }
    .msg .quem { display: block; font-size: 11px; color: #888; margin-bottom: 2px; }
    .msg.cliente { background: #fff; border: 1px solid #e0e4e0; align-self: flex-start;
                   border-bottom-left-radius: 4px; }
    .msg.empresa { background: #dcefdd; align-self: flex-end; border-bottom-right-radius: 4px; }
    .msg.empresa.origem-vendedor { background: #d7e6f7; }
    .msg.empresa.origem-painel { background: #f0e6f7; }
    .envio { background: #fff; border-top: 1px solid #e0e4e0; padding: 12px 20px; }
    .envio form { display: flex; gap: 10px; max-width: 900px; margin: 0 auto; }
    .envio textarea { flex: 1; padding: 9px 10px; border: 1px solid #ccc; border-radius: 8px; font-size: 14px;
                      font-family: inherit; resize: none; height: 44px; }
    .envio button { padding: 0 18px; border: 0; border-radius: 8px; background: #2f5233; color: #fff;
                    font-size: 14px; cursor: pointer; font-family: inherit; }
    .envio button:hover { background: #3d6b42; }
    .envio button:disabled { background: #9db5a0; cursor: default; }
    .feedback { font-size: 13px; max-width: 900px; margin: 6px auto 0; min-height: 17px; }
    .feedback.erro { color: #b00020; }
    .feedback.ok { color: #2f5233; }
    .aviso { font-size: 12px; color: #8a6d00; background: #fff8e1; padding: 6px 10px; border-radius: 5px;
             max-width: 900px; margin: 8px auto 0; }
    .vazio { color: #999; font-size: 13px; text-align: center; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="topo">
    <div>
      <h1>${escapeHtml(titulo)}</h1>
      <p class="contato">${escapeHtml(lead.whatsappNumber)}</p>
    </div>
    <div style="display:flex; align-items:center; gap:10px;">
      <span id="badge" class="badge ${lead.emAtendimentoHumano ? "humano" : "bot"}">${
        lead.emAtendimentoHumano ? "● atendimento humano" : "bot ativo"
      }</span>
      <a class="voltar" href="/painel">← Painel</a>
    </div>
  </div>

  <div id="mensagens"><p class="vazio">Carregando conversa...</p></div>

  <div class="envio">
    <form id="form-envio">
      <textarea id="texto" maxlength="4096" placeholder="Responder como Casa da Árvore (sai pelo número do bot)..."></textarea>
      <button type="submit" id="btn-enviar">Enviar</button>
    </form>
    <p class="feedback" id="feedback"></p>
    <p class="aviso">Ao enviar por aqui, o bot para de responder este cliente (atendimento humano). Use
      “Devolver ao bot” no painel quando terminar.</p>
  </div>

<script>
var LEAD_ID = ${JSON.stringify(lead.id)};
var lista = document.getElementById("mensagens");
var badge = document.getElementById("badge");
var feedback = document.getElementById("feedback");
var form = document.getElementById("form-envio");
var campo = document.getElementById("texto");
var botao = document.getElementById("btn-enviar");
var assinatura = "";

function apiUrl() {
  // location.origin explícito: URL relativa quebra quando a página é aberta
  // com credenciais na URL (mesmo motivo do painel principal).
  return location.origin + "/api/leads/" + LEAD_ID + "/conversa";
}

function escapeHtml(t) {
  var div = document.createElement("div");
  div.textContent = t;
  return div.innerHTML;
}

var LABEL_ORIGEM = { bot: "Tia Bia (bot)", vendedor: "Vendedor (WhatsApp)", painel: "Painel" };

function render(dados) {
  var nova = JSON.stringify(dados.mensagens);
  var noFim = lista.scrollTop + lista.clientHeight >= lista.scrollHeight - 40;
  if (nova === assinatura) return;
  assinatura = nova;

  badge.className = "badge " + (dados.lead.em_atendimento_humano ? "humano" : "bot");
  badge.textContent = dados.lead.em_atendimento_humano ? "● atendimento humano" : "bot ativo";

  if (dados.mensagens.length === 0) {
    lista.innerHTML = '<p class="vazio">Nenhuma mensagem registrada ainda.</p>';
    return;
  }

  lista.innerHTML = dados.mensagens.map(function (m) {
    var data = new Date(m.criadaEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    var quem = m.direcao === "cliente" ? "Cliente" : (LABEL_ORIGEM[m.origem] || "Empresa");
    var classes = "msg " + m.direcao + (m.origem ? " origem-" + m.origem : "");
    return '<div class="' + classes + '"><span class="quem">' + escapeHtml(quem) + " · " + data + "</span>" + escapeHtml(m.texto) + "</div>";
  }).join("");

  if (noFim) lista.scrollTop = lista.scrollHeight;
}

async function atualizar() {
  try {
    var resp = await fetch(apiUrl());
    if (!resp.ok) return;
    render(await resp.json());
  } catch (e) { /* rede oscilou; a próxima rodada tenta de novo */ }
}

form.addEventListener("submit", async function (ev) {
  ev.preventDefault();
  var texto = campo.value.trim();
  if (!texto) return;

  botao.disabled = true;
  feedback.className = "feedback";
  feedback.textContent = "Enviando...";
  try {
    var resp = await fetch(apiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: texto }),
    });
    var corpo = await resp.json().catch(function () { return {}; });
    if (!resp.ok) {
      feedback.className = "feedback erro";
      feedback.textContent = (corpo && corpo.erro && (corpo.erro.formErrors || corpo.erro)) || "Falha ao enviar.";
      if (typeof feedback.textContent !== "string") feedback.textContent = "Falha ao enviar.";
      return;
    }
    campo.value = "";
    feedback.className = "feedback ok";
    feedback.textContent = "Enviado ✓";
    lista.scrollTop = lista.scrollHeight;
    await atualizar();
  } catch (e) {
    feedback.className = "feedback erro";
    feedback.textContent = "Falha de rede ao enviar.";
  } finally {
    botao.disabled = false;
  }
});

campo.addEventListener("keydown", function (ev) {
  if (ev.key === "Enter" && !ev.shiftKey) {
    ev.preventDefault();
    form.requestSubmit();
  }
});

atualizar().then(function () { lista.scrollTop = lista.scrollHeight; });
setInterval(atualizar, 5000);
</script>
</body>
</html>`;
}
