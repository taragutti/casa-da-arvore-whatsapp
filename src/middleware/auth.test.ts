import { describe, it, expect } from "vitest";
import { autorPodeAcessarUnidade, Autor } from "./auth";

function autor(overrides: Partial<Autor> = {}): Autor {
  return { usuarioId: "u-1", nome: "Teste", compartilhado: false, papel: "atendente", unidades: [], ...overrides };
}

describe("autorPodeAcessarUnidade (estágio 3 — permissões)", () => {
  it("admin acessa qualquer unidade, mesmo sem nenhuma vinculada", () => {
    const admin = autor({ papel: "admin", unidades: [] });
    expect(autorPodeAcessarUnidade(admin, "casarao")).toBe(true);
    expect(autorPodeAcessarUnidade(admin, null)).toBe(true);
  });

  it("atendente acessa lead da própria unidade", () => {
    const a = autor({ unidades: ["casarao", "casa_por_do_sol"] });
    expect(autorPodeAcessarUnidade(a, "casarao")).toBe(true);
  });

  it("atendente NÃO acessa lead de unidade fora da lista dele", () => {
    const a = autor({ unidades: ["casarao", "casa_por_do_sol"] });
    expect(autorPodeAcessarUnidade(a, "casa_da_arvore")).toBe(false);
  });

  it("atendente sem nenhuma unidade vinculada não acessa lead com unidade definida", () => {
    const a = autor({ unidades: [] });
    expect(autorPodeAcessarUnidade(a, "casarao")).toBe(false);
  });

  it("lead sem unidade decidida ainda é visível a todo atendente — não pode ficar sem ninguém trabalhando nele", () => {
    const a = autor({ unidades: ["casarao"] });
    expect(autorPodeAcessarUnidade(a, null)).toBe(true);
  });
});
