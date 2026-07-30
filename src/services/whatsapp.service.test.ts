import { describe, it, expect } from "vitest";
import {
  montarResumoParaVendedor,
  montarVariaveisTemplateVendedor,
  CORPO_TEMPLATE_HANDOFF,
  ResumoLeadParaVendedor,
} from "./whatsapp.service";

function resumoBase(overrides: Partial<ResumoLeadParaVendedor> = {}): ResumoLeadParaVendedor {
  return {
    whatsappCliente: "+5522999999999",
    nomeCliente: "Maria",
    email: null,
    ramo: "casamento",
    unidadeRecomendada: "casa_por_do_sol",
    dataEvento: "2027-03-10",
    numeroConvidados: 150,
    orcamentoMencionado: 50000,
    resumoPedido: "Casamento com vista para o mar",
    objecaoOuDuvida: null,
    gatilho: "pergunta_valor",
    paraGerente: false,
    slaMinutos: 20,
    dentroDoHorarioComercial: true,
    mensagemOriginal: "Quanto custa pra 150 pessoas?",
    dadosRamo: {},
    ...overrides,
  };
}

describe("montarResumoParaVendedor", () => {
  it("inclui os dados essenciais do lead pro vendedor conseguir atender", () => {
    const texto = montarResumoParaVendedor(resumoBase());

    expect(texto).toContain("Maria");
    expect(texto).toContain("+5522999999999");
    expect(texto).toContain("casamento");
    expect(texto).toContain("casa por do sol");
    expect(texto).toContain("2027-03-10");
    expect(texto).toContain("150");
    expect(texto).toContain("Quanto custa pra 150 pessoas?");
  });

  it("formata o prazo com o SLA em horário comercial", () => {
    const texto = montarResumoParaVendedor(resumoBase({ slaMinutos: 15, dentroDoHorarioComercial: true }));
    expect(texto).toContain("responder em até 15 min");
  });

  it("fora do horário comercial, avisa que o prazo é no próximo dia útil em vez do SLA", () => {
    const texto = montarResumoParaVendedor(resumoBase({ dentroDoHorarioComercial: false }));
    expect(texto).toContain("próximo dia útil");
    expect(texto).not.toContain("responder em até");
  });

  it("reclamação é destacada como assunto de gerente", () => {
    const texto = montarResumoParaVendedor(resumoBase({ gatilho: "reclamacao", paraGerente: true }));
    expect(texto).toContain("GERENTE");
  });

  it("lead sem dados opcionais não gera linhas vazias nem 'null' no texto", () => {
    const texto = montarResumoParaVendedor(
      resumoBase({
        nomeCliente: null,
        email: null,
        ramo: null,
        unidadeRecomendada: null,
        dataEvento: null,
        numeroConvidados: null,
        orcamentoMencionado: null,
        objecaoOuDuvida: null,
        resumoPedido: "",
      })
    );

    expect(texto).not.toContain("null");
    expect(texto).not.toContain("undefined");
    expect(texto).toContain("não informado");
  });

  it("inclui os detalhes coletados por ramo, formatando booleanos e listas", () => {
    const texto = montarResumoParaVendedor(
      resumoBase({
        dadosRamo: {
          nomes_noivos: "Maria & João",
          interesse_hospedagem: true,
          necessidades_tecnicas: ["auditório", "catering"],
          nome_debutante: null,
        },
      })
    );

    expect(texto).toContain("nomes noivos: Maria & João");
    expect(texto).toContain("interesse hospedagem: sim");
    expect(texto).toContain("necessidades tecnicas: auditório, catering");
    expect(texto).not.toContain("nome debutante");
  });

  it("formata o orçamento em reais com separador de milhar", () => {
    const texto = montarResumoParaVendedor(resumoBase({ orcamentoMencionado: 50000 }));
    expect(texto).toContain("50.000");
  });
});

describe("montarVariaveisTemplateVendedor", () => {
  it("gera exatamente a quantidade de variáveis que o corpo do template aprovado declara", () => {
    const declaradas = new Set(CORPO_TEMPLATE_HANDOFF.match(/\{\{\d+\}\}/g));
    const variaveis = montarVariaveisTemplateVendedor(resumoBase());

    // Se este teste quebrar, o corpo do template e o builder saíram de sincronia
    // — resubmeter na Meta e ajustar a ordem em montarVariaveisTemplateVendedor.
    expect(variaveis).toHaveLength(declaradas.size);
  });

  it("nunca devolve variável vazia (a Meta rejeita), mesmo com lead sem nenhum dado", () => {
    const variaveis = montarVariaveisTemplateVendedor(
      resumoBase({
        nomeCliente: null,
        email: null,
        ramo: null,
        unidadeRecomendada: null,
        dataEvento: null,
        numeroConvidados: null,
        orcamentoMencionado: null,
        objecaoOuDuvida: null,
        resumoPedido: "",
        dadosRamo: {},
      })
    );

    for (const v of variaveis) {
      expect(v.length).toBeGreaterThan(0);
    }
    expect(variaveis).toContain("não informado");
  });

  it("remove quebras de linha e espaços repetidos (a Meta rejeita nas variáveis)", () => {
    const variaveis = montarVariaveisTemplateVendedor(
      resumoBase({ mensagemOriginal: "Oi,\n\nquero    saber\to preço" })
    );

    for (const v of variaveis) {
      expect(v).not.toMatch(/[\r\n\t]/);
      expect(v).not.toMatch(/\s{2,}/);
    }
    expect(variaveis[9]).toBe("Oi, quero saber o preço");
  });

  it("trunca mensagem muito longa em vez de estourar o limite do corpo do template", () => {
    const variaveis = montarVariaveisTemplateVendedor(
      resumoBase({ mensagemOriginal: "a".repeat(2000) })
    );

    expect(variaveis[9].endsWith("…")).toBe(true);
    expect(variaveis[9].length).toBeLessThan(2000);
  });

  it("achata os dados por ramo numa linha única, sem perder informação", () => {
    const variaveis = montarVariaveisTemplateVendedor(
      resumoBase({
        dadosRamo: {
          nomes_noivos: "Maria & João",
          interesse_hospedagem: true,
          necessidades_tecnicas: ["auditório", "catering"],
          nome_debutante: null,
        },
      })
    );

    expect(variaveis[7]).toContain("nomes noivos: Maria & João");
    expect(variaveis[7]).toContain("interesse hospedagem: sim");
    expect(variaveis[7]).toContain("auditório/catering");
    expect(variaveis[7]).not.toContain("nome debutante");
    expect(variaveis[7]).not.toMatch(/[\r\n]/);
  });

  it("marca urgência de gerente na variável de motivo", () => {
    const variaveis = montarVariaveisTemplateVendedor(resumoBase({ gatilho: "reclamacao", paraGerente: true }));
    expect(variaveis[0]).toContain("URGENTE");
    expect(variaveis[0]).toContain("reclamacao");
  });

  it("junta data, convidados e orçamento numa variável só", () => {
    const variaveis = montarVariaveisTemplateVendedor(resumoBase());
    expect(variaveis[6]).toContain("2027-03-10");
    expect(variaveis[6]).toContain("150 convidados");
    expect(variaveis[6]).toContain("50.000");
  });

  it("o corpo montado cabe em 1024 caracteres mesmo com TODOS os campos no extremo", () => {
    // Pior caso deliberado: todo campo de texto livre gigante, inclusive os que
    // vêm do cliente (nome, e-mail) e não só a mensagem.
    const variaveis = montarVariaveisTemplateVendedor(
      resumoBase({
        nomeCliente: "N".repeat(500),
        email: `${"e".repeat(300)}@exemplo.com`,
        mensagemOriginal: "x".repeat(3000),
        resumoPedido: "y".repeat(1000),
        objecaoOuDuvida: "z".repeat(1000),
        orcamentoMencionado: 999999999,
        numeroConvidados: 999999,
        gatilho: "falha_classificacao_repetida",
        paraGerente: true,
        dentroDoHorarioComercial: false,
        dadosRamo: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`campo_${i}`, "valor".repeat(20)])),
      })
    );

    const corpoFinal = variaveis.reduce(
      (corpo, valor, i) => corpo.replace(`{{${i + 1}}}`, valor),
      CORPO_TEMPLATE_HANDOFF
    );

    expect(corpoFinal.length).toBeLessThanOrEqual(1024);
  });

  it("com campos curtos, sobra orçamento e a mensagem do cliente não é cortada", () => {
    const mensagem = "Quero fazer a festa de 15 anos da minha filha em março de 2027, com 100 convidados";
    const variaveis = montarVariaveisTemplateVendedor(resumoBase({ mensagemOriginal: mensagem, dadosRamo: {} }));

    expect(variaveis[9]).toBe(mensagem);
  });
});
