import { describe, it, expect } from "vitest";
import { determinarUnidadeRecomendada } from "./routing.service";
import { DadosPorRamo } from "./anthropic.service";

function dadosRamoVazio(overrides: Partial<DadosPorRamo> = {}): DadosPorRamo {
  return {
    nome_aniversariante: null,
    idade_aniversariante: null,
    tema_festa: null,
    nome_debutante: null,
    formato_festa: null,
    nomes_noivos: null,
    origem_casal: null,
    preferencia_espaco: null,
    interesse_hospedagem: null,
    nome_empresa: null,
    contato_nome: null,
    contato_cargo: null,
    tipo_evento_corporativo: null,
    necessidades_tecnicas: [],
    nome_responsavel: null,
    nome_crianca: null,
    idade_crianca: null,
    data_aniversario_crianca: null,
    ...overrides,
  };
}

describe("determinarUnidadeRecomendada", () => {
  describe("ramo infantil (Seção 3.1)", () => {
    it("até 50 convidados, qualquer investimento -> Park Lagos", () => {
      expect(determinarUnidadeRecomendada("infantil", dadosRamoVazio(), 50, null)).toBe("park_lagos");
      expect(determinarUnidadeRecomendada("infantil", dadosRamoVazio(), 10, 100000)).toBe("park_lagos");
    });

    it("50 a 100 convidados, até R$ 20 mil -> Park Lagos", () => {
      expect(determinarUnidadeRecomendada("infantil", dadosRamoVazio(), 80, 20000)).toBe("park_lagos");
    });

    it("50 a 100 convidados, acima de R$ 20 mil -> Casa da Árvore", () => {
      expect(determinarUnidadeRecomendada("infantil", dadosRamoVazio(), 80, 20001)).toBe("casa_da_arvore");
    });

    it("50 a 100 convidados sem orçamento informado -> null (falta dado pra decidir)", () => {
      expect(determinarUnidadeRecomendada("infantil", dadosRamoVazio(), 80, null)).toBeNull();
    });

    it("mais de 100 convidados, qualquer investimento -> Casa da Árvore", () => {
      expect(determinarUnidadeRecomendada("infantil", dadosRamoVazio(), 150, null)).toBe("casa_da_arvore");
      expect(determinarUnidadeRecomendada("infantil", dadosRamoVazio(), 300, 5000)).toBe("casa_da_arvore");
    });

    it("sem número de convidados informado -> null", () => {
      expect(determinarUnidadeRecomendada("infantil", dadosRamoVazio(), null, 10000)).toBeNull();
    });
  });

  it("ramo 15_anos sempre roteia para o Casarão", () => {
    expect(determinarUnidadeRecomendada("15_anos", dadosRamoVazio(), null, null)).toBe("casarao");
  });

  describe("ramo casamento (Seção 3.3)", () => {
    it("preferência por vista para o mar -> Casa Pôr do Sol", () => {
      expect(
        determinarUnidadeRecomendada("casamento", dadosRamoVazio({ preferencia_espaco: "vista_mar" }), null, null)
      ).toBe("casa_por_do_sol");
    });

    it("casal de fora (outra cidade ou exterior) -> Casa Pôr do Sol, mesmo sem preferência de espaço", () => {
      expect(
        determinarUnidadeRecomendada("casamento", dadosRamoVazio({ origem_casal: "outra_cidade" }), null, null)
      ).toBe("casa_por_do_sol");
      expect(
        determinarUnidadeRecomendada("casamento", dadosRamoVazio({ origem_casal: "exterior" }), null, null)
      ).toBe("casa_por_do_sol");
    });

    it("espaço climatizado/aberto e casal local (Cabo Frio) -> Casarão", () => {
      expect(
        determinarUnidadeRecomendada(
          "casamento",
          dadosRamoVazio({ preferencia_espaco: "climatizado", origem_casal: "cabo_frio" }),
          null,
          null
        )
      ).toBe("casarao");
      expect(
        determinarUnidadeRecomendada(
          "casamento",
          dadosRamoVazio({ preferencia_espaco: "aberto", origem_casal: "cabo_frio" }),
          null,
          null
        )
      ).toBe("casarao");
    });

    it("não especificou ou aberto às duas opções -> null (mandar mídia das duas, deixar o lead sinalizar)", () => {
      expect(determinarUnidadeRecomendada("casamento", dadosRamoVazio(), null, null)).toBeNull();
      expect(
        determinarUnidadeRecomendada(
          "casamento",
          dadosRamoVazio({ preferencia_espaco: "aberto_as_duas" }),
          null,
          null
        )
      ).toBeNull();
    });

    it("espaço climatizado sem informar origem do casal -> null (dado insuficiente)", () => {
      expect(
        determinarUnidadeRecomendada("casamento", dadosRamoVazio({ preferencia_espaco: "climatizado" }), null, null)
      ).toBeNull();
    });
  });

  it("ramo corporativo sempre roteia para o Casarão", () => {
    expect(determinarUnidadeRecomendada("corporativo", dadosRamoVazio(), null, null)).toBe("casarao");
  });

  it("ramo recreacao_avulsa sempre roteia para o Shopping Park Lagos", () => {
    expect(determinarUnidadeRecomendada("recreacao_avulsa", dadosRamoVazio(), null, null)).toBe(
      "shopping_park_lagos"
    );
  });

  it("ramo outro ou não classificado -> null, sem roteamento automático (Seção 3.6)", () => {
    expect(determinarUnidadeRecomendada("outro", dadosRamoVazio(), null, null)).toBeNull();
    expect(determinarUnidadeRecomendada(null, dadosRamoVazio(), null, null)).toBeNull();
  });
});
