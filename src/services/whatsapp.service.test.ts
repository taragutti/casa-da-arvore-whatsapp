import { describe, it, expect } from "vitest";
import { montarResumoParaVendedor, ResumoLeadParaVendedor } from "./whatsapp.service";

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
