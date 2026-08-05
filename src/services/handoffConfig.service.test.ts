import { describe, it, expect } from "vitest";
import {
  detectarGatilhoHandoff,
  calcularSlaMinutos,
  determinarNumeroVendedor,
  dentroDoHorarioComercial,
  REGRAS_HANDOFF_PADRAO,
  REGRAS_SLA_PADRAO,
  REGRAS_VENDEDOR_PADRAO,
  REGRAS_HORARIO_PADRAO,
} from "./handoff.service";

/**
 * Estes testes existem para provar que a tela de configuração tem EFEITO. Os
 * testes originais do handoff usam os padrões (parâmetro omitido) e continuam
 * cobrindo o comportamento de fábrica; aqui a regra é passada explicitamente.
 */
describe("configuração alterada muda o comportamento do handoff", () => {
  it("palavra adicionada passa a disparar handoff", () => {
    const mensagem = "isso é um descalabro completo";

    expect(detectarGatilhoHandoff(mensagem, "neutro", 0)).toBeNull();

    const comNova = {
      ...REGRAS_HANDOFF_PADRAO,
      palavrasReclamacao: [...REGRAS_HANDOFF_PADRAO.palavrasReclamacao, "descalabro"],
    };
    expect(detectarGatilhoHandoff(mensagem, "neutro", 0, comNova)).toEqual({
      gatilho: "reclamacao",
      paraGerente: true,
    });
  });

  it("palavra removida para de disparar", () => {
    const semConsultor = {
      ...REGRAS_HANDOFF_PADRAO,
      palavrasPedidoHumano: REGRAS_HANDOFF_PADRAO.palavrasPedidoHumano.filter((p) => p !== "consultor"),
    };
    expect(detectarGatilhoHandoff("quero falar com consultor", "neutro", 0, semConsultor)).toBeNull();
  });

  it("limite de tentativas configurado é respeitado", () => {
    const limite5 = { ...REGRAS_HANDOFF_PADRAO, tentativasSemClassificacaoLimite: 5 };

    // Com o padrão (2) já dispararia; com 5, ainda não.
    expect(detectarGatilhoHandoff("???", "neutro", 3)).not.toBeNull();
    expect(detectarGatilhoHandoff("???", "neutro", 3, limite5)).toBeNull();
    expect(detectarGatilhoHandoff("???", "neutro", 5, limite5)).toEqual({
      gatilho: "falha_classificacao_repetida",
      paraGerente: false,
    });
  });

  it("SLA configurado por unidade é usado", () => {
    const sla = { ...REGRAS_SLA_PADRAO, porUnidade: { ...REGRAS_SLA_PADRAO.porUnidade, casarao: 45 } };
    expect(calcularSlaMinutos("casarao", "casamento", sla)).toBe(45);
    expect(calcularSlaMinutos("casarao", "casamento")).toBe(15); // padrão intacto
  });

  it("corporativo continua sobrepondo a unidade, com o valor configurado", () => {
    const sla = { ...REGRAS_SLA_PADRAO, corporativo: 3 };
    expect(calcularSlaMinutos("shopping_park_lagos", "corporativo", sla)).toBe(3);
  });

  it("unidade sem SLA salvo cai no valor de 'sem unidade', não em NaN", () => {
    const sla = { ...REGRAS_SLA_PADRAO, porUnidade: {} as never, semUnidade: 22 };
    expect(calcularSlaMinutos("casarao", "casamento", sla)).toBe(22);
  });

  describe("determinarNumeroVendedor", () => {
    it("casarão e casa pôr do sol vão pro vendedor comercial", () => {
      expect(determinarNumeroVendedor("casarao")).toBe(REGRAS_VENDEDOR_PADRAO.porUnidade.casarao);
      expect(determinarNumeroVendedor("casa_por_do_sol")).toBe(REGRAS_VENDEDOR_PADRAO.porUnidade.casa_por_do_sol);
    });

    it("casa da árvore, park lagos e shopping park lagos vão pro vendedor de infantil", () => {
      expect(determinarNumeroVendedor("casa_da_arvore")).toBe(REGRAS_VENDEDOR_PADRAO.porUnidade.casa_da_arvore);
      expect(determinarNumeroVendedor("park_lagos")).toBe(REGRAS_VENDEDOR_PADRAO.porUnidade.park_lagos);
      expect(determinarNumeroVendedor("shopping_park_lagos")).toBe(
        REGRAS_VENDEDOR_PADRAO.porUnidade.shopping_park_lagos
      );
    });

    it("unidade ainda indefinida cai no vendedor padrão", () => {
      expect(determinarNumeroVendedor(null)).toBe(REGRAS_VENDEDOR_PADRAO.padrao);
    });

    it("vendedor configurado por unidade é usado no lugar do padrão", () => {
      const vendedor = {
        ...REGRAS_VENDEDOR_PADRAO,
        porUnidade: { ...REGRAS_VENDEDOR_PADRAO.porUnidade, casarao: "+5522911112222" },
      };
      expect(determinarNumeroVendedor("casarao", vendedor)).toBe("+5522911112222");
      expect(determinarNumeroVendedor("casarao")).toBe(REGRAS_VENDEDOR_PADRAO.porUnidade.casarao); // padrão intacto
    });

    it("unidade sem vendedor salvo cai no padrão, não em undefined", () => {
      const vendedor = { ...REGRAS_VENDEDOR_PADRAO, porUnidade: {} as never, padrao: "+5522933334444" };
      expect(determinarNumeroVendedor("casarao", vendedor)).toBe("+5522933334444");
    });
  });

  describe("horário de atendimento", () => {
    // Domingo 10h e sábado 10h em Brasília (UTC-3).
    const domingo10h = new Date("2026-08-02T13:00:00Z");
    const sabado10h = new Date("2026-08-01T13:00:00Z");
    const terca20h = new Date("2026-08-04T23:00:00Z");

    it("padrão: fechado domingo, aberto sábado", () => {
      expect(dentroDoHorarioComercial(domingo10h)).toBe(false);
      expect(dentroDoHorarioComercial(sabado10h)).toBe(true);
    });

    it("ativar domingo abre o domingo", () => {
      const abreDomingo = { ...REGRAS_HORARIO_PADRAO, atendeDomingo: true };
      expect(dentroDoHorarioComercial(domingo10h, abreDomingo)).toBe(true);
    });

    it("desativar sábado fecha o sábado", () => {
      const fechaSabado = { ...REGRAS_HORARIO_PADRAO, atendeSabado: false };
      expect(dentroDoHorarioComercial(sabado10h, fechaSabado)).toBe(false);
    });

    it("estender o horário passa a incluir a noite", () => {
      expect(dentroDoHorarioComercial(terca20h)).toBe(false);
      const ate22 = { ...REGRAS_HORARIO_PADRAO, horaFechamento: 22 };
      expect(dentroDoHorarioComercial(terca20h, ate22)).toBe(true);
    });
  });
});
