import { describe, it, expect } from "vitest";
import { idParamSchema, atualizacaoSchema, notaSchema } from "./leadsApi.schemas";

const UUID_VALIDO = "9cadaae2-b023-47b5-bb75-69d544d7e01b";

describe("idParamSchema", () => {
  it("aceita UUID válido", () => {
    expect(idParamSchema.safeParse(UUID_VALIDO).success).toBe(true);
  });

  it("rejeita id que não é UUID — evita query com valor inválido chegando no Postgres", () => {
    expect(idParamSchema.safeParse("123").success).toBe(false);
    expect(idParamSchema.safeParse("").success).toBe(false);
    expect(idParamSchema.safeParse("'; DROP TABLE leads; --").success).toBe(false);
  });
});

describe("atualizacaoSchema", () => {
  it("aceita mudança de etapa do funil", () => {
    const r = atualizacaoSchema.safeParse({ status: "negociacao" });
    expect(r.success).toBe(true);
  });

  it("aceita confirmação de unidade", () => {
    expect(atualizacaoSchema.safeParse({ unidade_confirmada: "casarao" }).success).toBe(true);
  });

  it("aceita devolver ao bot", () => {
    expect(atualizacaoSchema.safeParse({ devolver_ao_bot: true }).success).toBe(true);
  });

  it("aceita os três campos juntos", () => {
    const r = atualizacaoSchema.safeParse({
      status: "fechado",
      unidade_confirmada: "casa_por_do_sol",
      devolver_ao_bot: true,
    });
    expect(r.success).toBe(true);
  });

  it("rejeita corpo vazio — evita PATCH que não faz nada passar como sucesso", () => {
    expect(atualizacaoSchema.safeParse({}).success).toBe(false);
  });

  it("rejeita status fora do enum do banco", () => {
    expect(atualizacaoSchema.safeParse({ status: "em_andamento" }).success).toBe(false);
    expect(atualizacaoSchema.safeParse({ status: "NOVO" }).success).toBe(false);
  });

  it("rejeita unidade fora do enum do banco", () => {
    expect(atualizacaoSchema.safeParse({ unidade_confirmada: "casa_da_praia" }).success).toBe(false);
  });

  it("rejeita devolver_ao_bot: false — remarcar como atendimento humano não é suportado por esta rota", () => {
    expect(atualizacaoSchema.safeParse({ devolver_ao_bot: false }).success).toBe(false);
  });

  it("aceita todos os status do enum, pra o funil inteiro ser navegável", () => {
    for (const status of ["novo", "qualificando", "proposta_enviada", "negociacao", "fechado", "perdido"]) {
      expect(atualizacaoSchema.safeParse({ status }).success, status).toBe(true);
    }
  });

  it("aceita todas as 5 unidades", () => {
    for (const u of ["casa_da_arvore", "park_lagos", "shopping_park_lagos", "casarao", "casa_por_do_sol"]) {
      expect(atualizacaoSchema.safeParse({ unidade_confirmada: u }).success, u).toBe(true);
    }
  });
});

describe("notaSchema", () => {
  it("aceita nota com texto e autor", () => {
    const r = notaSchema.safeParse({ texto: "Cliente pediu proposta por e-mail", autor: "Thiago" });
    expect(r.success).toBe(true);
  });

  it("aceita nota sem autor (credencial compartilhada, autor é opcional)", () => {
    expect(notaSchema.safeParse({ texto: "Ligou, não atendeu" }).success).toBe(true);
  });

  it("rejeita texto vazio ou só espaços", () => {
    expect(notaSchema.safeParse({ texto: "" }).success).toBe(false);
    expect(notaSchema.safeParse({ texto: "   " }).success).toBe(false);
  });

  it("apara espaços em volta do texto e do autor", () => {
    const r = notaSchema.safeParse({ texto: "  anotação  ", autor: "  Thiago  " });
    expect(r.success && r.data.texto).toBe("anotação");
    expect(r.success && r.data.autor).toBe("Thiago");
  });

  it("rejeita texto acima de 2000 caracteres", () => {
    expect(notaSchema.safeParse({ texto: "a".repeat(2001) }).success).toBe(false);
    expect(notaSchema.safeParse({ texto: "a".repeat(2000) }).success).toBe(true);
  });
});
