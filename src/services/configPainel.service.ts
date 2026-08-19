import { Autor } from "../middleware/auth";
import { Configuracoes } from "../repositories/configuracoes.repo";
import { UnidadeRecomendada } from "./routing.service";
import { escapeHtml } from "../utils/html";

const LABEL_UNIDADE: Record<UnidadeRecomendada, string> = {
  casa_da_arvore: "Casa da Árvore",
  park_lagos: "Park Lagos",
  shopping_park_lagos: "Shopping Park Lagos",
  casarao: "Casarão",
  casa_por_do_sol: "Casa Pôr do Sol",
};

/**
 * Réguas de follow-up. O rótulo ("2h") é a CHAVE técnica usada na fila e não
 * muda; o nome exibido é posicional ("1ª cobrança") justamente para não mentir
 * quando alguém configurar a régua "2h" para 4 horas.
 */
const REGUAS: { chave: "2h" | "48h" | "7d" | "30d"; nome: string }[] = [
  { chave: "2h", nome: "1ª cobrança" },
  { chave: "48h", nome: "2ª cobrança" },
  { chave: "7d", nome: "3ª cobrança" },
  { chave: "30d", nome: "4ª cobrança (repete)" },
];

/** Converte minutos em algo legível, pra quem edita não precisar dividir de cabeça. */
function porExtenso(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 1440) {
    const h = minutos / 60;
    return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
  }
  const d = minutos / 1440;
  return `${Number.isInteger(d) ? d : d.toFixed(1)} dia(s)`;
}

function campoMinutos(id: string, rotulo: string, valor: number, ajuda = ""): string {
  return `
  <div class="campo">
    <label for="${id}">${escapeHtml(rotulo)}</label>
    <div class="linha-campo">
      <input type="number" id="${id}" value="${valor}" min="1" step="1">
      <span class="unid">min</span>
      <span class="extenso" data-para="${id}">${porExtenso(valor)}</span>
    </div>
    ${ajuda ? `<p class="ajuda">${escapeHtml(ajuda)}</p>` : ""}
  </div>`;
}

function campoTelefone(id: string, rotulo: string, valor: string): string {
  return `
  <div class="campo">
    <label for="${id}">${escapeHtml(rotulo)}</label>
    <input type="text" id="${id}" value="${escapeHtml(valor)}" placeholder="+5522900000000" class="tel">
  </div>`;
}

function listaPalavras(id: string, rotulo: string, termos: string[], ajuda: string): string {
  return `
  <div class="campo">
    <label for="${id}">${escapeHtml(rotulo)} <span class="contador" data-conta="${id}">${termos.length}</span></label>
    <textarea id="${id}" rows="4" spellcheck="false">${escapeHtml(termos.join("\n"))}</textarea>
    <p class="ajuda">${escapeHtml(ajuda)}</p>
  </div>`;
}

export function renderizarConfigHtml(config: Configuracoes, autor: Autor): string {
  const unidades = Object.keys(LABEL_UNIDADE) as UnidadeRecomendada[];

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Configurações — Casa da Árvore</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; margin: 0; padding: 20px;
           background: #f4f6f4; color: #222; }
    h1 { color: #2f5233; margin: 0 0 4px; font-size: 22px; }
    h2 { color: #2f5233; font-size: 16px; margin: 0 0 4px; }
    .sub { color: #666; font-size: 14px; margin: 0 0 20px; }
    .topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; max-width: 860px;
            flex-wrap: wrap; }
    .usuario { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #555; }
    .usuario form { margin: 0; }
    .conteudo { max-width: 860px; }
    .bloco { background: #fff; border: 1px solid #e6eae6; border-radius: 10px; padding: 18px; margin-bottom: 16px; }
    .bloco > .desc { color: #666; font-size: 13px; margin: 0 0 14px; line-height: 1.5; }
    .grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
    .campo label { display: block; font-size: 13px; font-weight: 600; color: #33502f; margin-bottom: 5px; }
    .linha-campo { display: flex; align-items: center; gap: 7px; }
    input[type=number] { width: 96px; padding: 7px 9px; border: 1px solid #cfd8d0; border-radius: 6px;
                         font-size: 14px; font-family: inherit; }
    input.tel { width: 100%; padding: 7px 9px; border: 1px solid #cfd8d0; border-radius: 6px;
                font-size: 14px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    textarea { width: 100%; padding: 8px 9px; border: 1px solid #cfd8d0; border-radius: 6px; font-size: 13px;
               font-family: ui-monospace, SFMono-Regular, Menlo, monospace; resize: vertical; }
    .unid { color: #888; font-size: 13px; }
    .extenso { color: #2f5233; font-size: 12px; background: #eef3ee; padding: 2px 7px; border-radius: 10px; }
    .contador { font-weight: 400; color: #888; font-size: 12px; }
    .ajuda { color: #777; font-size: 12px; margin: 5px 0 0; line-height: 1.45; }
    .check { display: flex; align-items: center; gap: 8px; font-size: 14px; }
    .check input { width: 16px; height: 16px; }
    button { padding: 9px 16px; border: 0; border-radius: 6px; background: #2f5233; color: #fff; font-size: 14px;
             cursor: pointer; font-family: inherit; }
    button:hover { background: #3d6b42; }
    button:disabled { opacity: .6; cursor: default; }
    button.sair, a.voltar { background: #fff; color: #2f5233; border: 1px solid #cfd8d0; padding: 6px 12px;
                            border-radius: 6px; font-size: 13px; text-decoration: none; cursor: pointer; }
    .barra { position: sticky; bottom: 0; background: #f4f6f4; padding: 14px 0; border-top: 1px solid #e0e5e0;
             display: flex; align-items: center; gap: 14px; }
    .aviso { padding: 12px; border-radius: 8px; font-size: 13px; line-height: 1.5; margin-bottom: 16px; }
    .aviso.templates { background: #fff8e1; color: #8a6d00; border: 1px solid #ffe69c; }
    .aviso-bootstrap { background: #fff8e1; color: #8a6d00; border: 1px solid #ffe69c; padding: 12px;
                       border-radius: 8px; font-size: 13px; margin-bottom: 16px; line-height: 1.5; }
    .status { font-size: 13px; }
    .status.ok { color: #2f6b33; }
    .status.erro { color: #a12; }
    .rodape { color: #888; font-size: 12px; margin: 4px 0 24px; }
  </style>
</head>
<body>
  <div class="topo">
    <div>
      <h1>Configurações do workflow</h1>
      <p class="sub">Prazos, horário, SLA e gatilhos — valem sem precisar de novo deploy</p>
    </div>
    <div class="usuario">
      <a class="voltar" href="/painel">← Leads</a>
      <a class="voltar" href="/painel/midias">Mídias</a>
      <a class="voltar" href="/painel/usuarios">Usuários</a>
      <span>${escapeHtml(autor.nome)}</span>
      <form method="post" action="/logout"><button type="submit" class="sair">Sair</button></form>
    </div>
  </div>

  <div class="conteudo">
  ${
    autor.compartilhado
      ? `<div class="aviso-bootstrap"><b>Você entrou pela credencial compartilhada.</b>
         Nesse modo não há registro de quem alterou a configuração.</div>`
      : ""
  }

    <div class="aviso templates">
      <b>O texto das mensagens não está aqui.</b> As cobranças são enviadas por templates aprovados na Meta
      (<code>followup_2h</code>, <code>followup_48h</code>, <code>followup_7d</code>, <code>followup_30d</code>),
      e mudar a redação exige reaprovação da Meta — não adiantaria editar aqui. Esta tela controla
      <b>quando</b> cada coisa acontece, não o que é dito.
    </div>

    <div class="bloco">
      <h2>Régua de silêncio</h2>
      <p class="desc">Quanto tempo esperar, desde o último contato do cliente, antes de cada cobrança.
        Precisam ser crescentes — a 2ª maior que a 1ª, e assim por diante.</p>
      <div class="grade">
        ${REGUAS.map((r) => campoMinutos(`fu_${r.chave}`, r.nome, config.followUpMinutos[r.chave])).join("")}
      </div>
    </div>

    <div class="bloco">
      <h2>Horário de atendimento</h2>
      <p class="desc">Fuso de Brasília. Cobrança que cairia fora deste horário é <b>adiada</b>, não descartada —
        o lead não perde o contato.</p>
      <div class="grade">
        <div class="campo">
          <label for="abre">Abre às</label>
          <div class="linha-campo"><input type="number" id="abre" value="${config.horario.horaAbertura}" min="0" max="23"><span class="unid">h</span></div>
        </div>
        <div class="campo">
          <label for="fecha">Fecha às</label>
          <div class="linha-campo"><input type="number" id="fecha" value="${config.horario.horaFechamento}" min="1" max="24"><span class="unid">h</span></div>
        </div>
        <div class="campo">
          <label>Dias</label>
          <div class="check"><input type="checkbox" id="sab" ${config.horario.atendeSabado ? "checked" : ""}><label for="sab" style="font-weight:400;margin:0">Atende sábado</label></div>
          <div class="check" style="margin-top:6px"><input type="checkbox" id="dom" ${config.horario.atendeDomingo ? "checked" : ""}><label for="dom" style="font-weight:400;margin:0">Atende domingo</label></div>
        </div>
        ${campoMinutos(
          "reagenda",
          "Adiar por",
          config.reagendamentoForaHorarioMinutos,
          "Quanto esperar para tentar de novo quando cai fora do horário."
        )}
      </div>
    </div>

    <div class="bloco">
      <h2>SLA de resposta humana</h2>
      <p class="desc">Prazo informado ao vendedor quando o lead é passado para ele. Aparece na notificação —
        não bloqueia nem cancela nada.</p>
      <div class="grade">
        ${unidades
          .map((u) => campoMinutos(`sla_${u}`, LABEL_UNIDADE[u], config.sla.porUnidade[u]))
          .join("")}
        ${campoMinutos("sla_corp", "Corporativo (sobrepõe a unidade)", config.sla.corporativo)}
        ${campoMinutos("sla_sem", "Unidade ainda indefinida", config.sla.semUnidade)}
      </div>
    </div>

    <div class="bloco">
      <h2>Aviso de ociosidade do vendedor</h2>
      <p class="desc">Se o vendedor não responder o cliente dentro deste prazo, o bot manda uma mensagem
        avisando que o consultor está ocupado e já retorna — diferente do SLA acima, este prazo é
        <b>fiscalizado por código</b> e dispara ação de verdade.</p>
      <div class="grade">
        ${campoMinutos(
          "aviso_ociosidade",
          "Avisar o cliente após",
          config.avisoOciosidadeVendedorMinutos,
          "Contado a partir do handoff ou da última mensagem do cliente sem resposta do vendedor."
        )}
      </div>
    </div>

    <div class="bloco">
      <h2>Resumo diário de leads para vendedores</h2>
      <p class="desc">Todo dia, no horário abaixo (exceto domingo), cada vendedor com celular pessoal
        cadastrado (em <a href="/painel/usuarios">Usuários</a>) recebe no WhatsApp dele um resumo dos
        leads ativos da(s) unidade(s) que atende. Vendedor sem lead ativo não recebe mensagem.</p>
      <div class="grade">
        <div class="campo">
          <label>Enviar resumo diário</label>
          <div class="check">
            <input type="checkbox" id="resumo_ativo" ${config.resumoDiarioVendedor.ativo ? "checked" : ""}>
            <label for="resumo_ativo" style="font-weight:400;margin:0">Ativado</label>
          </div>
        </div>
        <div class="campo">
          <label for="resumo_hora">Horário de envio</label>
          <div class="linha-campo">
            <input type="number" id="resumo_hora" value="${config.resumoDiarioVendedor.hora}" min="0" max="23">
            <span class="unid">h</span>
          </div>
        </div>
      </div>
    </div>

    <div class="bloco">
      <h2>Vendedor que recebe o handoff</h2>
      <p class="desc">Número de WhatsApp que recebe a notificação de cada lead passado para humano, por unidade.
        Formato internacional, com "+" e código do país (ex: <code>+5522997546818</code>).</p>
      <div class="grade">
        ${unidades
          .map((u) => campoTelefone(`vend_${u}`, LABEL_UNIDADE[u], config.vendedor.porUnidade[u]))
          .join("")}
        ${campoTelefone("vend_padrao", "Unidade ainda indefinida", config.vendedor.padrao)}
      </div>
    </div>

    <div class="bloco">
      <h2>Gatilhos de passagem para humano</h2>
      <p class="desc">Uma palavra por linha. A comparação ignora maiúsculas e busca <b>parte</b> da mensagem:
        "consultor" também casa "quero falar com consultor". Salvamos em minúsculas e sem repetição.</p>
      <div class="grade">
        ${listaPalavras(
          "p_reclamacao",
          "Reclamação",
          config.handoff.palavrasReclamacao,
          "Vai direto para o gerente, não para o vendedor."
        )}
        ${listaPalavras(
          "p_humano",
          "Pede atendimento humano",
          config.handoff.palavrasPedidoHumano,
          "Cliente pedindo explicitamente para falar com alguém."
        )}
        ${listaPalavras(
          "p_contrato",
          "Quer fechar",
          config.handoff.palavrasPedidoContrato,
          "Sinal de compra — prioridade máxima de atendimento."
        )}
        <div class="campo">
          <label for="tentativas">Mensagens sem entender antes de passar</label>
          <div class="linha-campo"><input type="number" id="tentativas" value="${config.handoff.tentativasSemClassificacaoLimite}" min="1" max="10"></div>
          <p class="ajuda">Depois desse número de mensagens que a IA não conseguiu classificar, um humano assume.</p>
        </div>
      </div>
    </div>

    <div class="barra">
      <button type="button" id="salvar">Salvar alterações</button>
      <span class="status" id="status"></span>
    </div>
    <p class="rodape">${
      config.atualizadoEm
        ? `Última alteração: ${escapeHtml(new Date(config.atualizadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }))}${
            config.atualizadoPorNome ? ` por ${escapeHtml(config.atualizadoPorNome)}` : ""
          }`
        : "Ainda usando os valores padrão."
    }</p>
  </div>

<script>
(function () {
  // URL absoluta pela mesma razão das outras telas: quando a página é aberta
  // como http://user:pass@host/..., o fetch() recusa URL com credenciais.
  var base = location.origin;
  var num = function (id) { return Number(document.getElementById(id).value); };
  var linhas = function (id) {
    return document.getElementById(id).value.split("\\n").map(function (t) { return t.trim(); })
      .filter(function (t) { return t.length > 0; });
  };

  // Espelha minutos em texto legível enquanto digita.
  document.querySelectorAll(".extenso").forEach(function (span) {
    var input = document.getElementById(span.dataset.para);
    if (!input) return;
    input.addEventListener("input", function () {
      var m = Number(input.value);
      if (!m || m < 0) { span.textContent = ""; return; }
      span.textContent = m < 60 ? m + " min"
        : m < 1440 ? (Number.isInteger(m / 60) ? m / 60 : (m / 60).toFixed(1)) + " h"
        : (Number.isInteger(m / 1440) ? m / 1440 : (m / 1440).toFixed(1)) + " dia(s)";
    });
  });

  document.querySelectorAll("textarea").forEach(function (ta) {
    var contador = document.querySelector('[data-conta="' + ta.id + '"]');
    if (!contador) return;
    ta.addEventListener("input", function () {
      contador.textContent = ta.value.split("\\n").filter(function (t) { return t.trim(); }).length;
    });
  });

  var status = document.getElementById("status");
  var botao = document.getElementById("salvar");

  botao.addEventListener("click", async function () {
    var corpo = {
      followUpMinutos: { "2h": num("fu_2h"), "48h": num("fu_48h"), "7d": num("fu_7d"), "30d": num("fu_30d") },
      reagendamentoForaHorarioMinutos: num("reagenda"),
      horario: {
        horaAbertura: num("abre"),
        horaFechamento: num("fecha"),
        atendeSabado: document.getElementById("sab").checked,
        atendeDomingo: document.getElementById("dom").checked
      },
      sla: {
        porUnidade: {
${(Object.keys(LABEL_UNIDADE) as UnidadeRecomendada[])
  .map((u) => `          "${u}": num("sla_${u}")`)
  .join(",\n")}
        },
        corporativo: num("sla_corp"),
        semUnidade: num("sla_sem")
      },
      vendedor: {
        porUnidade: {
${(Object.keys(LABEL_UNIDADE) as UnidadeRecomendada[])
  .map((u) => `          "${u}": document.getElementById("vend_${u}").value.trim()`)
  .join(",\n")}
        },
        padrao: document.getElementById("vend_padrao").value.trim()
      },
      handoff: {
        palavrasReclamacao: linhas("p_reclamacao"),
        palavrasPedidoHumano: linhas("p_humano"),
        palavrasPedidoContrato: linhas("p_contrato"),
        tentativasSemClassificacaoLimite: num("tentativas")
      },
      avisoOciosidadeVendedorMinutos: num("aviso_ociosidade"),
      resumoDiarioVendedor: {
        ativo: document.getElementById("resumo_ativo").checked,
        hora: num("resumo_hora")
      }
    };

    botao.disabled = true;
    status.textContent = "Salvando...";
    status.className = "status";

    try {
      var resp = await fetch(base + "/api/configuracoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo)
      });
      var dados = await resp.json().catch(function () { return {}; });
      if (!resp.ok) {
        status.textContent = dados.erro || "Não foi possível salvar.";
        status.className = "status erro";
      } else {
        status.textContent = "Salvo. Já está valendo.";
        status.className = "status ok";
      }
    } catch (e) {
      status.textContent = "Falha de rede ao salvar.";
      status.className = "status erro";
    } finally {
      botao.disabled = false;
    }
  });
})();
</script>
</body>
</html>`;
}
