import { describe, it, expect } from "vitest";
import { configSchema } from "./configApi.schemas";

const valido = {
  followUpMinutos: { "2h": 120, "48h": 2880, "7d": 10080, "30d": 43200 },
  reagendamentoForaHorarioMinutos: 60,
  horario: { horaAbertura: 9, horaFechamento: 18, atendeSabado: true, atendeDomingo: false },
  sla: {
    porUnidade: { casa_da_arvore: 15, park_lagos: 15, casarao: 15, casa_por_do_sol: 20, shopping_park_lagos: 30 },
    corporativo: 10,
    semUnidade: 15,
  },
  handoff: {
    palavrasReclamacao: ["absurdo"],
    palavrasPedidoHumano: ["consultor"],
    palavrasPedidoContrato: ["quero fechar"],
    tentativasSemClassificacaoLimite: 2,
  },
};

const erro = (corpo: unknown) => {
  const r = configSchema.safeParse(corpo);
  return r.success ? null : r.error.issues[0]?.message;
};

describe("validação da configuração de workflow", () => {
  it("aceita a configuração padrão", () => {
    expect(configSchema.safeParse(valido).success).toBe(true);
  });

  /**
   * Régua fora de ordem é o erro mais fácil de cometer nesta tela e o mais
   * difícil de diagnosticar: o sintoma é o cliente receber a 2ª cobrança antes
   * da 1ª, dias depois, sem nada apontando de volta pra configuração.
   */
  it("recusa régua não crescente", () => {
    const msg = erro({ ...valido, followUpMinutos: { "2h": 5000, "48h": 2880, "7d": 10080, "30d": 43200 } });
    expect(msg).toMatch(/crescentes/i);
  });

  it("recusa fechamento antes da abertura", () => {
    const msg = erro({ ...valido, horario: { ...valido.horario, horaAbertura: 18, horaFechamento: 9 } });
    expect(msg).toMatch(/fechamento/i);
  });

  it("recusa prazo zero ou negativo", () => {
    expect(erro({ ...valido, reagendamentoForaHorarioMinutos: 0 })).toMatch(/mínimo/i);
    expect(erro({ ...valido, followUpMinutos: { ...valido.followUpMinutos, "2h": -10 } })).toMatch(/mínimo/i);
  });

  it("recusa lista de gatilho vazia — deixaria o gatilho morto sem avisar", () => {
    const msg = erro({ ...valido, handoff: { ...valido.handoff, palavrasPedidoHumano: [] } });
    expect(msg).toMatch(/ao menos uma palavra/i);
  });

  it("recusa termo curto demais, que casaria com quase toda mensagem", () => {
    const msg = erro({ ...valido, handoff: { ...valido.handoff, palavrasReclamacao: ["ok"] } });
    expect(msg).toMatch(/1–2 letras/i);
  });

  /**
   * A comparação no handoff é por substring em minúsculas: termo salvo com
   * maiúscula ou espaço sobrando nunca casaria, e a tela não teria como avisar
   * que a palavra "não funciona".
   */
  it("normaliza para minúsculas, corta espaços e remove repetição", () => {
    const r = configSchema.parse({
      ...valido,
      handoff: { ...valido.handoff, palavrasPedidoHumano: ["  CONSULTOR ", "consultor", "Vendedor", ""] },
    });
    expect(r.handoff.palavrasPedidoHumano).toEqual(["consultor", "vendedor"]);
  });

  it("completa SLA de unidade ausente com o padrão, em vez de deixar undefined", () => {
    const r = configSchema.parse({
      ...valido,
      sla: { ...valido.sla, porUnidade: { casarao: 25 } },
    });
    expect(r.sla.porUnidade.casarao).toBe(25);
    // As demais vêm do padrão — sem isso o e-mail ao vendedor mostraria "NaN min".
    expect(r.sla.porUnidade.casa_da_arvore).toBe(15);
    expect(r.sla.porUnidade.shopping_park_lagos).toBe(30);
  });

  it("recusa limite de tentativas fora da faixa útil", () => {
    expect(erro({ ...valido, handoff: { ...valido.handoff, tentativasSemClassificacaoLimite: 0 } })).toBeTruthy();
    expect(erro({ ...valido, handoff: { ...valido.handoff, tentativasSemClassificacaoLimite: 99 } })).toBeTruthy();
  });
});
