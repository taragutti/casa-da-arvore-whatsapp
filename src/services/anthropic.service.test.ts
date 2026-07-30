import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do SDK da Anthropic: substitui a classe inteira por uma versão fake
// cujo messages.create() é controlado por cada teste (mockCreate).
const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(function AnthropicMock() {
      return { messages: { create: mockCreate } };
    }),
  };
});

// Importado DEPOIS do vi.mock (hoisted pelo vitest) para já pegar a versão mockada.
const { extractFromMessage } = await import("./anthropic.service");

function respostaIA(json: object) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: "text", text: JSON.stringify(json) }],
  });
}

beforeEach(() => {
  mockCreate.mockReset();
});

describe("extractFromMessage", () => {
  it("extrai todos os campos de uma mensagem completa (aniversário infantil)", async () => {
    respostaIA({
      nome_cliente: "Sofia",
      tipo_evento: "aniversario_infantil",
      data_evento: "2026-09-12",
      numero_convidados: 30,
      orcamento_mencionado: 3000,
      resumo_pedido: "Quer orçamento para festa de 5 anos da Sofia em setembro",
      palavras_chave: ["orçamento", "aniversário", "30 pessoas"],
      objecao_ou_duvida: null,
      gatilho_emocional: null,
    });

    const resultado = await extractFromMessage(
      "Oi, gostaria de saber o orçamento para uma festa de aniversário infantil em setembro, umas 30 pessoas. Minha filha se chama Sofia"
    );

    expect(resultado.nome_cliente).toBe("Sofia");
    expect(resultado.tipo_evento).toBe("aniversario_infantil");
    expect(resultado.data_evento).toBe("2026-09-12");
    expect(resultado.numero_convidados).toBe(30);
    expect(resultado.palavras_chave).toHaveLength(3);
  });

  it("extrai objeção e gatilho emocional de uma mensagem de casamento com orçamento apertado", async () => {
    respostaIA({
      nome_cliente: null,
      tipo_evento: "casamento",
      data_evento: null,
      numero_convidados: null,
      orcamento_mencionado: 15000,
      resumo_pedido: "Quer saber se fazem casamento com orçamento apertado de até 15 mil",
      palavras_chave: ["casamento", "orçamento apertado"],
      objecao_ou_duvida: "Preocupação com o preço",
      gatilho_emocional: "economia",
    });

    const resultado = await extractFromMessage(
      "Vocês fazem casamento? Meu orçamento é bem apertado, uns 15 mil no máximo"
    );

    expect(resultado.objecao_ou_duvida).toBe("Preocupação com o preço");
    expect(resultado.gatilho_emocional).toBe("economia");
    expect(resultado.orcamento_mencionado).toBe(15000);
  });

  it("mensagem sem nenhum dado extraível retorna tudo null, sem inventar informação", async () => {
    respostaIA({
      nome_cliente: null,
      tipo_evento: null,
      data_evento: null,
      numero_convidados: null,
      orcamento_mencionado: null,
      resumo_pedido: "Cliente apenas cumprimentou, sem detalhes do evento",
      palavras_chave: ["oi", "tudo bem"],
      objecao_ou_duvida: null,
      gatilho_emocional: null,
    });

    const resultado = await extractFromMessage("Oi tudo bem");

    expect(resultado.tipo_evento).toBeNull();
    expect(resultado.nome_cliente).toBeNull();
    expect(resultado.orcamento_mencionado).toBeNull();
  });

  it("corrige tipo_evento fora do enum para 'outro' em vez de quebrar", async () => {
    respostaIA({
      nome_cliente: null,
      tipo_evento: "quinceañera", // não existe no enum do sistema
      data_evento: null,
      numero_convidados: null,
      orcamento_mencionado: null,
      resumo_pedido: "Festa de 15 anos estilo latino",
      palavras_chave: ["quinceañera"],
      objecao_ou_duvida: null,
      gatilho_emocional: null,
    });

    const resultado = await extractFromMessage("Fazem festa de quinceañera?");

    expect(resultado.tipo_evento).toBe("outro");
  });

  it("descarta data_evento em formato inválido/relativo em vez de quebrar", async () => {
    respostaIA({
      nome_cliente: null,
      tipo_evento: "casamento",
      data_evento: "mês que vem", // a IA não deveria mandar isso, mas o código tem que aguentar
      numero_convidados: null,
      orcamento_mencionado: null,
      resumo_pedido: "Quer casar mês que vem",
      palavras_chave: ["mês que vem"],
      objecao_ou_duvida: null,
      gatilho_emocional: null,
    });

    const resultado = await extractFromMessage("Quero casar mês que vem, vocês têm data?");

    expect(resultado.data_evento).toBeNull();
  });

  it("filtra palavras_chave quando a IA manda algo que não é array de strings", async () => {
    respostaIA({
      nome_cliente: null,
      tipo_evento: "corporativo",
      data_evento: null,
      numero_convidados: null,
      orcamento_mencionado: null,
      resumo_pedido: "Evento corporativo",
      palavras_chave: "não deveria ser string", // formato errado de propósito
      objecao_ou_duvida: null,
      gatilho_emocional: null,
    });

    const resultado = await extractFromMessage("Preciso de um espaço para evento corporativo");

    expect(resultado.palavras_chave).toEqual([]);
  });

  it("processa a resposta mesmo quando a IA envolve o JSON em cerca de markdown (```json ... ```)", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text:
            "```json\n" +
            JSON.stringify({
              nome_cliente: null,
              tipo_evento: "debutante",
              data_evento: null,
              numero_convidados: 80,
              orcamento_mencionado: null,
              resumo_pedido: "Festa de 15 anos em dezembro",
              palavras_chave: ["15 anos", "dezembro"],
              objecao_ou_duvida: null,
              gatilho_emocional: null,
            }) +
            "\n```",
        },
      ],
    });

    const resultado = await extractFromMessage("Quero orçamento pra festa de 15 anos em dezembro, 80 convidados");

    expect(resultado.tipo_evento).toBe("debutante");
    expect(resultado.numero_convidados).toBe(80);
    // Não deve ter precisado de retry — a primeira tentativa já resolveu.
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("nunca lança exceção não tratada quando a IA devolve um JSON malformado — falha de forma controlada após as tentativas de retry", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "isso não é um JSON válido {{{" }],
    });

    await expect(extractFromMessage("qualquer mensagem")).rejects.toThrow(
      /Falha na extração via IA após 2 tentativas/
    );
    // Confirma que houve retry (2 tentativas), não só uma chamada solta.
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("mensagem antiga (sem ramo/dados_ramo/sinal_engajamento na resposta da IA) continua funcionando com defaults seguros", async () => {
    respostaIA({
      nome_cliente: "Sofia",
      tipo_evento: "aniversario_infantil",
      data_evento: null,
      numero_convidados: null,
      orcamento_mencionado: null,
      resumo_pedido: "Festa da Sofia",
      palavras_chave: ["festa"],
      objecao_ou_duvida: null,
      gatilho_emocional: null,
    });

    const resultado = await extractFromMessage("Oi, quero saber sobre festa da Sofia");

    expect(resultado.ramo).toBeNull();
    expect(resultado.sinal_engajamento).toBe("neutro");
    expect(resultado.dados_ramo.nome_aniversariante).toBeNull();
    expect(resultado.dados_ramo.necessidades_tecnicas).toEqual([]);
  });

  it("classifica ramo infantil e extrai só os campos desse ramo, com sinal positivo", async () => {
    respostaIA({
      nome_cliente: "Marcia",
      tipo_evento: "aniversario_infantil",
      data_evento: null,
      numero_convidados: 60,
      orcamento_mencionado: null,
      resumo_pedido: "Festa de 5 anos do Miguel, tema dinossauros",
      palavras_chave: ["festa infantil", "dinossauros"],
      objecao_ou_duvida: null,
      gatilho_emocional: null,
      ramo: "infantil",
      dados_ramo: {
        nome_aniversariante: "Miguel",
        idade_aniversariante: 5,
        tema_festa: "dinossauros",
      },
      sinal_engajamento: "positivo",
    });

    const resultado = await extractFromMessage(
      "Adorei as fotos! Quero uma festa tema dinossauros pro Miguel, 5 aninhos, uns 60 convidados"
    );

    expect(resultado.ramo).toBe("infantil");
    expect(resultado.dados_ramo.nome_aniversariante).toBe("Miguel");
    expect(resultado.dados_ramo.idade_aniversariante).toBe(5);
    expect(resultado.dados_ramo.tema_festa).toBe("dinossauros");
    expect(resultado.dados_ramo.nomes_noivos).toBeNull();
    expect(resultado.sinal_engajamento).toBe("positivo");
  });

  it("classifica ramo casamento com preferência de espaço e sinal de pergunta_valor", async () => {
    respostaIA({
      nome_cliente: null,
      tipo_evento: "casamento",
      data_evento: null,
      numero_convidados: 150,
      orcamento_mencionado: null,
      resumo_pedido: "Casamento com vista para o mar, quer saber o valor",
      palavras_chave: ["vista para o mar", "quanto custa"],
      objecao_ou_duvida: null,
      gatilho_emocional: null,
      ramo: "casamento",
      dados_ramo: {
        preferencia_espaco: "vista_mar",
        origem_casal: "exterior",
        interesse_hospedagem: true,
      },
      sinal_engajamento: "pergunta_valor",
    });

    const resultado = await extractFromMessage(
      "Somos de fora do país, queremos um espaço com vista para o mar. Quanto custa pra 150 pessoas?"
    );

    expect(resultado.ramo).toBe("casamento");
    expect(resultado.dados_ramo.preferencia_espaco).toBe("vista_mar");
    expect(resultado.dados_ramo.origem_casal).toBe("exterior");
    expect(resultado.dados_ramo.interesse_hospedagem).toBe(true);
    expect(resultado.sinal_engajamento).toBe("pergunta_valor");
  });

  it("corrige ramo fora do enum para 'outro' e valor inválido em sub-campo enum de dados_ramo para null", async () => {
    respostaIA({
      nome_cliente: null,
      tipo_evento: "outro",
      data_evento: null,
      numero_convidados: null,
      orcamento_mencionado: null,
      resumo_pedido: "Chá de bebê",
      palavras_chave: ["chá de bebê"],
      objecao_ou_duvida: null,
      gatilho_emocional: null,
      ramo: "cha_de_bebe", // não existe no enum de ramo do sistema
      dados_ramo: {
        formato_festa: "gigante", // valor inventado, fora do enum
      },
      sinal_engajamento: "empolgado", // valor inventado, fora do enum
    });

    const resultado = await extractFromMessage("Fazem chá de bebê?");

    expect(resultado.ramo).toBe("outro");
    expect(resultado.dados_ramo.formato_festa).toBeNull();
    expect(resultado.sinal_engajamento).toBe("neutro");
  });

  it("extrai e-mail quando a mensagem traz um endereço válido", async () => {
    respostaIA({
      nome_cliente: "Ana",
      email: "ana@exemplo.com",
      tipo_evento: "casamento",
      data_evento: null,
      numero_convidados: null,
      orcamento_mencionado: null,
      resumo_pedido: "Quer orçamento, deixou o e-mail",
      palavras_chave: ["orçamento"],
      objecao_ou_duvida: null,
      gatilho_emocional: null,
    });

    const resultado = await extractFromMessage("Meu e-mail é ana@exemplo.com, pode mandar o orçamento?");

    expect(resultado.email).toBe("ana@exemplo.com");
  });

  it("descarta e-mail em formato inválido em vez de quebrar", async () => {
    respostaIA({
      nome_cliente: null,
      email: "nao-é-um-email",
      tipo_evento: null,
      data_evento: null,
      numero_convidados: null,
      orcamento_mencionado: null,
      resumo_pedido: "Mensagem qualquer",
      palavras_chave: [],
      objecao_ou_duvida: null,
      gatilho_emocional: null,
    });

    const resultado = await extractFromMessage("qualquer mensagem");

    expect(resultado.email).toBeNull();
  });

  it("mensagem sem e-mail retorna email null", async () => {
    respostaIA({
      nome_cliente: "Bruno",
      tipo_evento: "aniversario_infantil",
      data_evento: null,
      numero_convidados: null,
      orcamento_mencionado: null,
      resumo_pedido: "Festa infantil",
      palavras_chave: [],
      objecao_ou_duvida: null,
      gatilho_emocional: null,
    });

    const resultado = await extractFromMessage("Quero uma festa infantil");

    expect(resultado.email).toBeNull();
  });

  it("detecta aceite de cupom (ramo recreação avulsa)", async () => {
    respostaIA({
      nome_cliente: null,
      tipo_evento: null,
      data_evento: null,
      numero_convidados: null,
      orcamento_mencionado: null,
      resumo_pedido: "Aceitou o cupom de desconto",
      palavras_chave: ["cupom"],
      objecao_ou_duvida: null,
      gatilho_emocional: null,
      ramo: "recreacao_avulsa",
      dados_ramo: { cupom_aceito: true },
      sinal_engajamento: "positivo",
    });

    const resultado = await extractFromMessage("Sim, quero o cupom de desconto pra festa fechada!");

    expect(resultado.dados_ramo.cupom_aceito).toBe(true);
  });

  it("detecta recusa de cupom (ramo recreação avulsa)", async () => {
    respostaIA({
      nome_cliente: null,
      tipo_evento: null,
      data_evento: null,
      numero_convidados: null,
      orcamento_mencionado: null,
      resumo_pedido: "Recusou o cupom",
      palavras_chave: [],
      objecao_ou_duvida: null,
      gatilho_emocional: null,
      ramo: "recreacao_avulsa",
      dados_ramo: { cupom_aceito: false },
      sinal_engajamento: "neutro",
    });

    const resultado = await extractFromMessage("Não, obrigada, só a recreação avulsa mesmo por enquanto");

    expect(resultado.dados_ramo.cupom_aceito).toBe(false);
  });

  it("cupom_aceito fica null quando a IA não manda o campo (mensagem não relacionada a cupom)", async () => {
    respostaIA({
      nome_cliente: "Carla",
      tipo_evento: null,
      data_evento: null,
      numero_convidados: null,
      orcamento_mencionado: null,
      resumo_pedido: "Recreação avulsa pro filho",
      palavras_chave: [],
      objecao_ou_duvida: null,
      gatilho_emocional: null,
      ramo: "recreacao_avulsa",
      dados_ramo: { nome_responsavel: "Carla", nome_crianca: "Théo" },
      sinal_engajamento: "neutro",
    });

    const resultado = await extractFromMessage("Quero recreação avulsa pro meu filho Théo");

    expect(resultado.dados_ramo.cupom_aceito).toBeNull();
    expect(resultado.dados_ramo.nome_responsavel).toBe("Carla");
  });
});
