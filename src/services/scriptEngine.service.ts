/**
 * Motor do script de atendimento (Script_Bot_Atendimento.docx).
 *
 * É deliberadamente PURO e SÍNCRONO: recebe o estado da conversa e a mensagem
 * do cliente, devolve a lista de ações a executar e o novo estado. Nada de
 * banco, nada de fetch. Quem tem efeito colateral é o executor
 * (scriptRunner.service), e é por isso que todo o miolo de decisão do fluxo
 * pode ser testado com objetos literais — o mesmo padrão já usado em
 * handoff.service.
 */

import {
  IdNo,
  No,
  NOME_UNIDADE,
  NO_DE_APRESENTACAO,
  OpcaoMenu,
  obterNo,
} from "./scriptFluxo";
import { GatilhoHandoff, REGRAS_HANDOFF_PADRAO, RegrasHandoff } from "./handoff.service";
import { determinarUnidadeRecomendada, UnidadeRecomendada } from "./routing.service";
import { DadosPorRamo, RamoEvento } from "./anthropic.service";

// ---------------------------------------------------------------------------
// Ações que o executor precisa realizar
// ---------------------------------------------------------------------------

export type Acao =
  | { tipo: "enviar_texto"; texto: string }
  | { tipo: "enviar_material"; unidade: UnidadeRecomendada }
  | { tipo: "checar_agenda"; unidade: UnidadeRecomendada | null }
  | { tipo: "enviar_cupom" }
  | { tipo: "handoff"; motivo: GatilhoHandoff; paraGerente: boolean };

export interface EstadoScript {
  /** Nó em que a conversa parou. `null` = conversa ainda não começou. */
  noAtual: IdNo | null;
  /** Respostas coletadas pelos nós do script (não confundir com a extração da IA). */
  respostas: Record<string, string>;
  /** Fallbacks consecutivos no nó atual — dois seguidos viram handoff (11.2). */
  fallbacksConsecutivos: number;
}

export interface ContextoScript {
  /** Decide qual versão do N0 usar. */
  dentroDoHorarioComercial: boolean;
  /**
   * Campos que a IA extraiu da conversa. O script pergunta "nome e idade" numa
   * pergunta aberta só; quem transforma "vai fazer 6, o nome é Ana" em campos
   * é a extração que já existe. Aqui eles servem só para interpolar as
   * mensagens seguintes ("Que fofo, Ana!").
   */
  extraidos: Partial<Record<string, string>>;
  regrasHandoff?: RegrasHandoff;
}

export interface ResultadoScript {
  acoes: Acao[];
  estado: EstadoScript;
  /** Unidade decidida por um nó de roteamento neste passo, se houve. */
  unidadeDecidida: UnidadeRecomendada | null;
}

// ---------------------------------------------------------------------------
// Interpolação
// ---------------------------------------------------------------------------

const PLACEHOLDER = /\{\{(\w+)\}\}/g;
const TRECHO_OPCIONAL = /\[\[([^\]]*)\]\]/g;

/**
 * Substitui `{{campo}}` e resolve `[[trecho opcional]]`.
 *
 * O trecho opcional some inteiro se QUALQUER placeholder dentro dele estiver
 * vazio. É o que evita "Que fofo, ! 🎂" quando a extração não achou o nome —
 * situação comum, porque o cliente responde "vai fazer 6 aninhos" sem dizer
 * como a criança se chama.
 */
export function interpolar(texto: string, valores: Partial<Record<string, string>>): string {
  const semOpcionais = texto.replace(TRECHO_OPCIONAL, (_, trecho: string) => {
    const placeholders = [...trecho.matchAll(PLACEHOLDER)].map((m) => m[1]);
    const algumVazio = placeholders.some((campo) => !valores[campo]);
    return algumVazio ? "" : trecho;
  });

  return semOpcionais.replace(PLACEHOLDER, (_, campo: string) => valores[campo] ?? "");
}

// ---------------------------------------------------------------------------
// Interrupções: gatilhos de handoff (9.1) e FAQs (11.1)
// ---------------------------------------------------------------------------

/**
 * Termos de handoff que o documento define por escrito e que NÃO dependem da
 * classificação da IA. Reclamação, pedido de humano e pedido de contrato já
 * vivem em REGRAS_HANDOFF_PADRAO (editáveis no painel) e são reaproveitados.
 *
 * Nota sobre "valor final": o documento é específico — o gatilho é preço de
 * FECHAMENTO ("quanto fica no total", "valor fechado"), não qualquer menção a
 * preço. Um "quanto custa?" logo na abertura segue para a qualificação, que é
 * o que faz a escada de perguntas das Partes 4 a 8 chegar a existir.
 */
const TERMOS_VISITA = ["quero visitar", "conhecer o espaço", "conhecer o espaco", "agendar visita", "fazer uma visita", "visitar o espaço", "visitar o espaco"];
const TERMOS_VALOR_FINAL = ["quanto fica no total", "valor total", "preço final", "preco final", "valor fechado", "fechar o valor", "quanto fica tudo"];
const TERMOS_DESCONTO = ["tem desconto", "algum desconto", "valor melhor", "consigo um desconto", "faz por menos", "melhora o preço", "melhora o preco"];

export interface Interrupcao {
  motivo: GatilhoHandoff;
  paraGerente: boolean;
}

function contem(mensagem: string, termos: string[]): boolean {
  const texto = mensagem.toLowerCase();
  return termos.some((termo) => texto.includes(termo));
}

/** Gatilhos de handoff imediato (9.1). Ordem importa: reclamação vem primeiro e vai pro gerente. */
export function detectarInterrupcao(
  mensagem: string,
  regras: RegrasHandoff = REGRAS_HANDOFF_PADRAO
): Interrupcao | null {
  if (contem(mensagem, regras.palavrasReclamacao)) return { motivo: "reclamacao", paraGerente: true };
  if (contem(mensagem, regras.palavrasPedidoHumano)) return { motivo: "pedido_humano", paraGerente: false };
  if (contem(mensagem, regras.palavrasPedidoContrato)) return { motivo: "pedido_contrato", paraGerente: false };
  if (contem(mensagem, TERMOS_VISITA)) return { motivo: "pedido_visita", paraGerente: false };
  if (contem(mensagem, TERMOS_VALOR_FINAL)) return { motivo: "pergunta_valor_final", paraGerente: false };
  if (contem(mensagem, TERMOS_DESCONTO)) return { motivo: "pedido_desconto", paraGerente: false };
  return null;
}

/**
 * FAQs que o bot responde sozinho (11.1). Depois de responder, a pergunta
 * pendente é repetida — senão o cliente responde a FAQ e o fluxo fica parado
 * esperando uma resposta que nunca vem no formato certo.
 */
interface Faq {
  id: string;
  termos: string[];
  resposta: string;
}

export const FAQS: Faq[] = [
  {
    id: "endereco",
    termos: ["onde fica", "qual o endereço", "qual o endereco", "endereço", "endereco", "localização", "localizacao", "como chego"],
    resposta:
      "Nossos endereços em Cabo Frio:\n\n🌳 Casa da Árvore\n🎈 Casa da Árvore Park Lagos — Henrique Terra, 1700, Palmeiras\n🏛️ Casarão\n🌅 Casa Pôr do Sol\n🛍️ Shopping Park Lagos — Henrique Terra, 1700, Palmeiras\n\nQuer que eu compartilhe o Google Maps de alguma unidade específica?",
  },
  {
    id: "buffet_incluso",
    termos: ["buffet está incluso", "buffet esta incluso", "buffet incluso", "inclui buffet", "tem buffet", "com buffet"],
    resposta:
      "Ótima pergunta!\n\nTrabalhamos com pacotes completos que incluem espaço + buffet + decoração base, mas também é possível fechar apenas o espaço se você já tem seu buffet de preferência.\n\nAs opções e valores variam conforme a unidade e o tamanho do evento.",
  },
  {
    id: "parcelamento",
    termos: ["parcelamento", "parcelar", "parcela", "dividir no cartão", "dividir no cartao", "condições de pagamento", "condicoes de pagamento"],
    resposta:
      "Sim! Trabalhamos com condições especiais de parcelamento, tanto no cartão quanto em boleto/PIX, com entrada e parcelas ao longo do período até a data do evento.\n\nAs condições exatas dependem do valor do contrato e da data.",
  },
  {
    id: "fornecedor_proprio",
    termos: ["meu próprio buffet", "meu proprio buffet", "levar meu buffet", "meu dj", "meu decorador", "fornecedor próprio", "fornecedor proprio", "posso levar"],
    resposta:
      "Nós temos fornecedores parceiros de confiança, mas também aceitamos que você traga seu próprio buffet, DJ ou decorador se preferir — nesse caso, cobramos apenas a locação do espaço.",
  },
];

export function detectarFaq(mensagem: string): Faq | null {
  return FAQS.find((faq) => contem(mensagem, faq.termos)) ?? null;
}

// ---------------------------------------------------------------------------
// Interpretação de resposta
// ---------------------------------------------------------------------------

/** Remove acentos e baixa a caixa — "Até 50" e "ate 50" precisam casar. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Casa a mensagem do cliente com uma opção do menu. Aceita, nesta ordem:
 * o número puro ("2"), o emoji numerado ("2️⃣"), o rótulo e os sinônimos.
 *
 * O número só conta quando a mensagem é praticamente só o número — senão
 * "quero para 100 pessoas" casaria com a opção 1 por conter o dígito "1".
 */
export function casarOpcao(mensagem: string, opcoes: OpcaoMenu[]): OpcaoMenu | null {
  const texto = normalizar(mensagem);
  const soDigitos = texto.replace(/[^\d]/g, "");

  if (soDigitos.length === 1 && texto.length <= 4) {
    const porNumero = opcoes.find((o) => o.numero === Number(soDigitos));
    if (porNumero) return porNumero;
  }

  for (const opcao of opcoes) {
    const alvos = [opcao.rotulo, ...(opcao.sinonimos ?? [])].map(normalizar);
    if (alvos.some((alvo) => alvo.length > 0 && texto.includes(alvo))) return opcao;
  }

  return null;
}

/** Nós que ficam parados esperando o cliente responder. */
type NoQuePergunta = Extract<No, { tipo: "pergunta_texto" | "pergunta_menu" | "cupom" }>;

/**
 * É um type predicate, e não um boolean simples, porque o TypeScript precisa
 * estreitar o tipo do nó depois da checagem — sem isso, ler `no.opcoes` logo
 * abaixo não compila.
 */
function esperaResposta(no: No): no is NoQuePergunta {
  return no.tipo === "pergunta_texto" || no.tipo === "pergunta_menu" || no.tipo === "cupom";
}

// ---------------------------------------------------------------------------
// Faixas → número, para reaproveitar o roteamento já existente e testado
// ---------------------------------------------------------------------------

/**
 * Cada faixa vira o número que cai do lado certo dos limiares do
 * routing.service. Ex.: "De 50 a 100" vira 100, que é exatamente onde a regra
 * do documento passa a olhar o investimento.
 */
const CONVIDADOS_POR_FAIXA: Record<string, number> = {
  ate_50: 50,
  "50_100": 100,
  "100_200": 200,
  mais_200: 300,
  ate_100: 100,
  "200_400": 400,
  mais_400: 500,
  "100_150": 150,
  "150_250": 250,
  mais_250: 300,
};

const INVESTIMENTO_POR_FAIXA: Record<string, number> = {
  ate_10k: 10000,
  "10k_20k": 20000,
  "20k_40k": 40000,
  acima_40k: 60000,
};

export function convidadosDaFaixa(faixa: string | undefined): number | null {
  if (!faixa) return null;
  return CONVIDADOS_POR_FAIXA[faixa] ?? null;
}

export function investimentoDaFaixa(faixa: string | undefined): number | null {
  if (!faixa) return null;
  return INVESTIMENTO_POR_FAIXA[faixa] ?? null;
}

// ---------------------------------------------------------------------------
// Roteamento a partir das respostas do script
// ---------------------------------------------------------------------------

/**
 * Traduz as respostas do menu para os parâmetros de
 * determinarUnidadeRecomendada. Reaproveitar a função existente (em vez de
 * reescrever as tabelas aqui) mantém uma fonte só de verdade para o
 * roteamento — ela já tem testes cobrindo as tabelas do fluxo.
 */
export function rotearPorRespostas(
  ramo: "infantil" | "casamento",
  respostas: Record<string, string>
): UnidadeRecomendada | null {
  const convidados = convidadosDaFaixa(respostas.faixa_convidados);

  if (ramo === "infantil") {
    return determinarUnidadeRecomendada(
      "infantil",
      {} as DadosPorRamo,
      convidados,
      investimentoDaFaixa(respostas.faixa_investimento)
    );
  }

  const dados = {
    origem_casal: respostas.origem_casal,
    preferencia_espaco: respostas.preferencia_espaco,
  } as unknown as DadosPorRamo;

  return determinarUnidadeRecomendada("casamento", dados, convidados, null);
}

// ---------------------------------------------------------------------------
// Passo do fluxo
// ---------------------------------------------------------------------------

/** Só pergunta hospedagem se o casal é de fora OU quer vista para o mar (N7C, condicional). */
function deveFazerN7C(respostas: Record<string, string>): boolean {
  return (
    respostas.origem_casal === "outra_cidade" ||
    respostas.origem_casal === "exterior" ||
    respostas.preferencia_espaco === "vista_mar"
  );
}

const RAMO_POR_ESCOLHA: Record<string, RamoEvento> = {
  infantil: "infantil",
  "15_anos": "15_anos",
  casamento: "casamento",
  corporativo: "corporativo",
  recreacao_avulsa: "recreacao_avulsa",
  outro: "outro",
};

export function ramoEscolhido(respostas: Record<string, string>): RamoEvento | null {
  return RAMO_POR_ESCOLHA[respostas.ramo_escolhido ?? ""] ?? null;
}

/**
 * Caminha pelos nós automáticos (mensagem, roteamento, material, agenda,
 * handoff) acumulando ações, e para no primeiro nó que espera resposta — ou
 * quando o fluxo acaba.
 *
 * O limite de 20 saltos é rede de segurança contra um ciclo criado por engano
 * na edição do grafo: sem ele, um `proximo` apontando para trás mandaria
 * mensagens em loop para o cliente.
 */
function avancar(
  inicio: IdNo | null,
  estado: EstadoScript,
  contexto: ContextoScript
): { acoes: Acao[]; noFinal: IdNo | null; unidadeDecidida: UnidadeRecomendada | null } {
  const acoes: Acao[] = [];
  let unidadeDecidida: UnidadeRecomendada | null = null;
  let atual = inicio;

  for (let salto = 0; salto < 20; salto++) {
    if (!atual) break;
    const no = obterNo(atual);
    if (!no) break;

    // N7C é o único nó condicional do documento.
    if (no.id === "N7C" && !deveFazerN7C(estado.respostas)) {
      atual = no.proximo ?? null;
      continue;
    }

    const valores = { ...contexto.extraidos, ...estado.respostas };
    for (const mensagem of no.mensagens) {
      const texto = interpolar(mensagem, valores).trim();
      if (texto) acoes.push({ tipo: "enviar_texto", texto });
    }

    if (esperaResposta(no)) return { acoes, noFinal: no.id, unidadeDecidida };

    switch (no.tipo) {
      case "roteamento": {
        const unidade = rotearPorRespostas(no.ramo, estado.respostas);
        if (!unidade) {
          // Sem dado suficiente para decidir (ex.: 50–100 convidados e o cliente
          // preferiu não falar de investimento). O documento manda escalar em
          // vez de o bot chutar unidade.
          acoes.push({ tipo: "handoff", motivo: "roteamento_indefinido", paraGerente: false });
          return { acoes, noFinal: null, unidadeDecidida };
        }
        unidadeDecidida = unidade;
        atual = NO_DE_APRESENTACAO[unidade] ?? null;
        continue;
      }
      case "material":
        acoes.push({ tipo: "enviar_material", unidade: no.unidade });
        unidadeDecidida = unidadeDecidida ?? no.unidade;
        break;
      case "agenda":
        acoes.push({ tipo: "checar_agenda", unidade: unidadeDecidida });
        break;
      case "handoff":
        acoes.push({ tipo: "handoff", motivo: no.motivo, paraGerente: false });
        return { acoes, noFinal: null, unidadeDecidida };
      default:
        break;
    }

    atual = no.proximo ?? null;
  }

  return { acoes, noFinal: atual, unidadeDecidida };
}

/**
 * Um passo do script: recebe a mensagem do cliente e devolve o que enviar.
 *
 * Ordem das verificações (é a ordem do documento, e ela importa):
 * 1. Gatilho de handoff imediato — vale mais que qualquer pergunta pendente.
 * 2. FAQ — responde e repete a pergunta pendente, sem perder o lugar no fluxo.
 * 3. Resposta à pergunta pendente.
 * 4. Não entendeu → fallback nível 1; duas vezes seguidas → nível 2 (handoff).
 */
export function passoDoScript(
  mensagem: string,
  estado: EstadoScript,
  contexto: ContextoScript
): ResultadoScript {
  const interrupcao = detectarInterrupcao(mensagem, contexto.regrasHandoff);
  if (interrupcao) {
    const valores = { ...contexto.extraidos, ...estado.respostas };
    const acoes: Acao[] = [];

    if (interrupcao.paraGerente) {
      acoes.push({
        tipo: "enviar_texto",
        texto:
          "Sinto muito por essa experiência. Vou te conectar imediatamente com o(a) gerente responsável para entender o que aconteceu e resolver da melhor forma possível.\n\nUm instante, por favor.",
      });
    } else {
      const noHandoff = obterNo("N9_HANDOFF");
      for (const m of noHandoff?.mensagens ?? []) {
        const texto = interpolar(m, valores).trim();
        if (texto) acoes.push({ tipo: "enviar_texto", texto });
      }
    }

    acoes.push({ tipo: "handoff", motivo: interrupcao.motivo, paraGerente: interrupcao.paraGerente });
    return { acoes, estado: { ...estado, noAtual: null }, unidadeDecidida: null };
  }

  // Conversa nova: entra pelo N0 e caminha até a primeira pergunta.
  if (estado.noAtual == null) {
    const inicio = contexto.dentroDoHorarioComercial ? "N0_COMERCIAL" : "N0_FORA_HORARIO";
    const { acoes, noFinal, unidadeDecidida } = avancar(inicio, estado, contexto);
    return {
      acoes,
      estado: { ...estado, noAtual: noFinal, fallbacksConsecutivos: 0 },
      unidadeDecidida,
    };
  }

  const no = obterNo(estado.noAtual);
  if (!no || !esperaResposta(no)) {
    // Estado inconsistente (nó removido numa edição do grafo, por exemplo):
    // recomeça em vez de deixar a conversa travada para sempre.
    const { acoes, noFinal, unidadeDecidida } = avancar("N1", estado, contexto);
    return { acoes, estado: { ...estado, noAtual: noFinal, fallbacksConsecutivos: 0 }, unidadeDecidida };
  }

  const faq = detectarFaq(mensagem);
  if (faq) {
    const valores = { ...contexto.extraidos, ...estado.respostas };
    const acoes: Acao[] = [{ tipo: "enviar_texto", texto: faq.resposta }];
    // Repete a pergunta pendente para o fluxo não ficar parado.
    for (const m of no.mensagens) {
      const texto = interpolar(m, valores).trim();
      if (texto) acoes.push({ tipo: "enviar_texto", texto });
    }
    return { acoes, estado, unidadeDecidida: null };
  }

  // Pergunta aberta aceita qualquer coisa: a resposta crua é gravada e a
  // extração da IA cuida de virar campo estruturado.
  if (no.tipo === "pergunta_texto") {
    const respostas = { ...estado.respostas, [no.campo]: mensagem.trim() };
    const estadoComResposta = { ...estado, respostas, fallbacksConsecutivos: 0 };
    const { acoes, noFinal, unidadeDecidida } = avancar(no.proximo ?? null, estadoComResposta, contexto);
    return { acoes, estado: { ...estadoComResposta, noAtual: noFinal }, unidadeDecidida };
  }

  const opcao = casarOpcao(mensagem, no.opcoes);

  if (!opcao) {
    const fallbacks = estado.fallbacksConsecutivos + 1;

    if (fallbacks >= 2) {
      return {
        acoes: [
          {
            tipo: "enviar_texto",
            texto:
              "Poxa, ainda não consegui entender. Vou te conectar com um dos nossos consultores para não te fazer perder tempo, tudo bem? 😊",
          },
          { tipo: "handoff", motivo: "precisa_qualificacao_humana", paraGerente: false },
        ],
        estado: { ...estado, noAtual: null, fallbacksConsecutivos: 0 },
        unidadeDecidida: null,
      };
    }

    const valores = { ...contexto.extraidos, ...estado.respostas };
    const acoes: Acao[] = [
      { tipo: "enviar_texto", texto: "Desculpa, não entendi bem 😅\n\nVocê pode digitar novamente ou escolher uma das opções que te mostrei?" },
    ];
    for (const m of no.mensagens) {
      const texto = interpolar(m, valores).trim();
      if (texto) acoes.push({ tipo: "enviar_texto", texto });
    }
    return { acoes, estado: { ...estado, fallbacksConsecutivos: fallbacks }, unidadeDecidida: null };
  }

  const respostas = { ...estado.respostas, [no.campo]: opcao.valor };
  const estadoComResposta = { ...estado, respostas, fallbacksConsecutivos: 0 };

  const acoesDoNo: Acao[] = [];
  if (no.tipo === "cupom" && opcao.valor === "sim") {
    acoesDoNo.push({ tipo: "enviar_cupom" });
  }

  const destino = opcao.proximo ?? no.proximo ?? null;
  const { acoes, noFinal, unidadeDecidida } = avancar(destino, estadoComResposta, contexto);

  return {
    acoes: [...acoesDoNo, ...acoes],
    estado: { ...estadoComResposta, noAtual: noFinal },
    unidadeDecidida,
  };
}

/** Nome de exibição da unidade, para a interpolação de `{{unidade_nome}}`. */
export function nomeDaUnidade(unidade: UnidadeRecomendada | null): string | undefined {
  return unidade ? NOME_UNIDADE[unidade] : undefined;
}
