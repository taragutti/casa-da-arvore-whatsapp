import { describe, it, expect } from "vitest";
import {
  Acao,
  ContextoScript,
  EstadoScript,
  casarOpcao,
  detectarFaq,
  detectarInterrupcao,
  interpolar,
  passoDoScript,
} from "./scriptEngine.service";
import { obterNo, todosOsNos } from "./scriptFluxo";

const CONTEXTO: ContextoScript = { dentroDoHorarioComercial: true, extraidos: {} };

function estadoInicial(): EstadoScript {
  return { noAtual: null, respostas: {}, fallbacksConsecutivos: 0 };
}

function textos(acoes: Acao[]): string[] {
  return acoes.filter((a) => a.tipo === "enviar_texto").map((a) => (a as { texto: string }).texto);
}

/** Roda uma sequência de mensagens do cliente e devolve o estado final e tudo que o bot mandou. */
function conversa(mensagens: string[], contexto: ContextoScript = CONTEXTO) {
  let estado = estadoInicial();
  let acoes: Acao[] = [];
  let unidade: string | null = null;

  for (const mensagem of mensagens) {
    const r = passoDoScript(mensagem, estado, contexto);
    estado = r.estado;
    acoes = r.acoes;
    unidade = r.unidadeDecidida ?? unidade;
  }

  return { estado, acoes, unidade };
}

describe("interpolar", () => {
  it("substitui o campo quando há valor", () => {
    expect(interpolar("Que fofo[[, {{nome_aniversariante}}]]! 🎂", { nome_aniversariante: "Ana" })).toBe(
      "Que fofo, Ana! 🎂"
    );
  });

  it("remove o trecho opcional inteiro quando o campo está vazio", () => {
    expect(interpolar("Que fofo[[, {{nome_aniversariante}}]]! 🎂", {})).toBe("Que fofo! 🎂");
  });
});

describe("casarOpcao", () => {
  const opcoes = obterNo("N4A")!.tipo === "pergunta_menu" ? (obterNo("N4A") as any).opcoes : [];

  it("casa pelo número puro", () => {
    expect(casarOpcao("2", opcoes)?.valor).toBe("50_100");
  });

  it("casa pelo emoji numerado", () => {
    expect(casarOpcao("3️⃣", opcoes)?.valor).toBe("100_200");
  });

  it("casa por sinônimo em texto livre", () => {
    expect(casarOpcao("acho que uns 100 a 200 pessoas", opcoes)?.valor).toBe("100_200");
  });

  it("não confunde número solto dentro de frase com escolha de menu", () => {
    // "1" aparece em "150", mas a frase não é uma escolha numérica.
    expect(casarOpcao("vai ser algo grande, umas 150 pessoas", opcoes)?.valor).not.toBe("ate_50");
  });
});

describe("primeiro contato", () => {
  it("abre com o N0 comercial e para na pergunta do N1", () => {
    const { estado, acoes } = conversa(["oi"]);
    expect(textos(acoes)[0]).toContain("Olá! 🎉 Tudo bem?");
    expect(textos(acoes).at(-1)).toContain("1️⃣ Festa infantil");
    expect(estado.noAtual).toBe("N1");
  });

  it("usa a versão fora do horário quando está fechado", () => {
    const { acoes } = conversa(["oi"], { ...CONTEXTO, dentroDoHorarioComercial: false });
    expect(textos(acoes)[0]).toContain("Que bom ter você aqui!");
    expect(textos(acoes)[1]).toContain("das 9h às 20h");
  });
});

describe("Ramo A — festa infantil", () => {
  it("percorre a escada até o roteamento e entrega na Casa da Árvore", () => {
    const { estado, acoes, unidade } = conversa([
      "oi",
      "1", // festa infantil
      "Ana, vai fazer 6 anos", // N2A
      "20/09/2026", // N3A
      "3", // N4A: 100 a 200 convidados
      "3", // N5A: R$ 20 a 40 mil
    ]);

    expect(unidade).toBe("casa_da_arvore");
    expect(textos(acoes)[0]).toContain("a Casa da Árvore é o espaço ideal");
    expect(acoes.some((a) => a.tipo === "enviar_material")).toBe(true);
    expect(acoes.some((a) => a.tipo === "handoff")).toBe(true);
    expect(estado.noAtual).toBeNull();
    expect(estado.respostas.faixa_convidados).toBe("100_200");
  });

  it("até 50 convidados vai para a Park Lagos independente do investimento", () => {
    const { unidade } = conversa(["oi", "1", "Ana, 6 anos", "novembro", "1", "4"]);
    expect(unidade).toBe("park_lagos");
  });

  it("interpola o nome extraído pela IA na pergunta seguinte", () => {
    let estado = estadoInicial();
    for (const m of ["oi", "1"]) estado = passoDoScript(m, estado, CONTEXTO).estado;

    const r = passoDoScript("Ana, vai fazer 6", estado, {
      ...CONTEXTO,
      extraidos: { nome_aniversariante: "Ana" },
    });
    expect(textos(r.acoes)[0]).toBe("Que fofo, Ana! 🎂");
  });
});

describe("Ramo C — casamento", () => {
  it("pula a pergunta de hospedagem quando o casal é local e quer climatizado", () => {
    const { estado, acoes } = conversa([
      "oi",
      "3", // casamento
      "João e Maria", // N2C
      "1", // N3C: Cabo Frio
      "2", // N4C: climatizado
      "10/10/2026", // N5C
      "2", // N6C: 50 a 100
    ]);

    // N7C não deve ter sido perguntado: o fluxo foi direto ao roteamento.
    expect(textos(acoes).join(" ")).not.toContain("parceria de hospedagem");
    expect(textos(acoes)[0]).toContain("Vocês vão amar o Casarão");
    expect(estado.noAtual).toBeNull();
  });

  it("faz a pergunta de hospedagem quando o casal vem de fora", () => {
    const { estado, acoes } = conversa(["oi", "3", "João e Maria", "2", "3", "10/10/2026", "2"]);
    expect(textos(acoes).join(" ")).toContain("parceria de hospedagem");
    expect(estado.noAtual).toBe("N7C");
  });

  it("acima de 150 convidados vai pro Casarão mesmo com vista para o mar", () => {
    const { unidade } = conversa(["oi", "3", "João e Maria", "1", "1", "10/10/2026", "5", "3"]);
    expect(unidade).toBe("casarao");
  });

  it("até 150 com vista para o mar vai pra Casa Pôr do Sol", () => {
    const { unidade } = conversa(["oi", "3", "João e Maria", "1", "1", "10/10/2026", "3", "3"]);
    expect(unidade).toBe("casa_por_do_sol");
  });
});

describe("Ramo D — corporativo", () => {
  it("faz handoff imediato depois da ficha técnica, sem passar por agenda", () => {
    const { acoes, estado } = conversa([
      "oi",
      "4",
      "Acme, sou o Thiago, gerente de RH, confraternização",
      "120 pessoas, dezembro, noturno",
      "2 e 5",
    ]);

    expect(acoes.some((a) => a.tipo === "checar_agenda")).toBe(false);
    expect(acoes.some((a) => a.tipo === "handoff" && a.motivo === "corporativo_ficha_tecnica")).toBe(true);
    expect(estado.noAtual).toBeNull();
  });
});

describe("Ramo E — recreação avulsa", () => {
  it("envia cupom quando o cliente aceita", () => {
    const { acoes } = conversa(["oi", "5", "6 anos", "1"]);
    expect(acoes.some((a) => a.tipo === "enviar_cupom")).toBe(true);
  });

  it("não envia cupom quando o cliente recusa", () => {
    const { acoes } = conversa(["oi", "5", "6 anos", "2"]);
    expect(acoes.some((a) => a.tipo === "enviar_cupom")).toBe(false);
  });
});

describe("fallbacks (11.2)", () => {
  it("nível 1 repete a pergunta", () => {
    const { estado, acoes } = conversa(["oi", "não sei bem o que quero"]);
    expect(textos(acoes)[0]).toContain("não entendi bem");
    expect(textos(acoes).at(-1)).toContain("1️⃣ Festa infantil");
    expect(estado.noAtual).toBe("N1");
    expect(estado.fallbacksConsecutivos).toBe(1);
  });

  it("nível 2 (segunda vez seguida) escala para humano", () => {
    const { estado, acoes } = conversa(["oi", "hmmm", "sei lá"]);
    expect(textos(acoes)[0]).toContain("Vou te conectar com um dos nossos consultores");
    expect(acoes.some((a) => a.tipo === "handoff" && a.motivo === "precisa_qualificacao_humana")).toBe(true);
    expect(estado.noAtual).toBeNull();
  });

  it("zera o contador quando o cliente acerta depois de errar", () => {
    const { estado } = conversa(["oi", "hmmm", "1"]);
    expect(estado.fallbacksConsecutivos).toBe(0);
    expect(estado.noAtual).toBe("N2A");
  });
});

describe("FAQs (11.1)", () => {
  it("responde e repete a pergunta pendente, sem perder o lugar no fluxo", () => {
    const { estado, acoes } = conversa(["oi", "1", "Ana, 6 anos", "onde fica?"]);
    expect(textos(acoes)[0]).toContain("Nossos endereços em Cabo Frio");
    expect(textos(acoes).at(-1)).toContain("data em mente");
    expect(estado.noAtual).toBe("N3A");
  });

  it("FAQ não conta como fallback", () => {
    const { estado } = conversa(["oi", "1", "Ana", "aceitam parcelamento?"]);
    expect(estado.fallbacksConsecutivos).toBe(0);
  });
});

describe("interrupções de handoff (9.1)", () => {
  it("reclamação vai pro gerente e nunca responde com script comercial", () => {
    const { acoes } = conversa(["oi", "1", "que descaso, péssimo atendimento"]);
    expect(textos(acoes)[0]).toContain("Sinto muito por essa experiência");
    expect(acoes.some((a) => a.tipo === "handoff" && a.paraGerente)).toBe(true);
  });

  it("pedido de valor final interrompe a qualificação", () => {
    const { acoes } = conversa(["oi", "1", "quanto fica no total?"]);
    expect(acoes.some((a) => a.tipo === "handoff" && a.motivo === "pergunta_valor_final")).toBe(true);
  });

  it("'quanto custa?' NÃO interrompe — segue qualificando (leitura literal da Parte 9)", () => {
    const { estado, acoes } = conversa(["oi", "1", "quanto custa?"]);
    expect(acoes.some((a) => a.tipo === "handoff")).toBe(false);
    expect(estado.noAtual).toBe("N3A"); // a resposta virou o texto do N2A e o fluxo andou
  });

  it("pedido de visita interrompe", () => {
    const { acoes } = conversa(["oi", "1", "quero visitar o espaço"]);
    expect(acoes.some((a) => a.tipo === "handoff" && a.motivo === "pedido_visita")).toBe(true);
  });
});

describe("integridade do grafo", () => {
  it("todo `proximo` aponta para um nó existente", () => {
    for (const no of todosOsNos()) {
      if (no.proximo) expect(obterNo(no.proximo), `${no.id} -> ${no.proximo}`).not.toBeNull();
      if (no.tipo === "pergunta_menu" || no.tipo === "cupom") {
        for (const opcao of no.opcoes) {
          if (opcao.proximo) expect(obterNo(opcao.proximo), `${no.id} opção ${opcao.numero}`).not.toBeNull();
        }
      }
    }
  });

  it("nenhum nó que espera resposta fica sem saída", () => {
    for (const no of todosOsNos()) {
      if (no.tipo === "pergunta_texto") expect(no.proximo, no.id).toBeTruthy();
      if (no.tipo === "pergunta_menu" || no.tipo === "cupom") {
        const temSaida = no.proximo || no.opcoes.every((o) => o.proximo);
        expect(temSaida, no.id).toBeTruthy();
      }
    }
  });
});

describe("detectores isolados", () => {
  it("detectarInterrupcao ignora mensagem comum", () => {
    expect(detectarInterrupcao("quero uma festa em novembro")).toBeNull();
  });

  it("detectarFaq encontra a FAQ de fornecedor próprio", () => {
    expect(detectarFaq("posso levar meu dj?")?.id).toBe("fornecedor_proprio");
  });
});
