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
});
