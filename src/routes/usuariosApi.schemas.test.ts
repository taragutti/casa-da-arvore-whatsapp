import { describe, it, expect } from "vitest";
import { criarUsuarioSchema, atualizarUsuarioSchema } from "./usuariosApi.schemas";

const validoCriar = {
  email: "atendente@casadaarvoreadventure.com.br",
  nome: "Maria",
  senha: "senha-forte-123",
  papel: "atendente",
  unidades: ["casarao", "casa_por_do_sol"],
};

describe("criarUsuarioSchema", () => {
  it("aceita payload válido", () => {
    expect(criarUsuarioSchema.safeParse(validoCriar).success).toBe(true);
  });

  it("normaliza e-mail para minúsculas", () => {
    const r = criarUsuarioSchema.parse({ ...validoCriar, email: "Atendente@Casadaarvoreadventure.com.br" });
    expect(r.email).toBe("atendente@casadaarvoreadventure.com.br");
  });

  it("recusa e-mail inválido", () => {
    expect(criarUsuarioSchema.safeParse({ ...validoCriar, email: "não-é-email" }).success).toBe(false);
  });

  it("recusa senha curta demais, reaproveitando a mesma regra do CLI", () => {
    const r = criarUsuarioSchema.safeParse({ ...validoCriar, senha: "curta" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/10 caracteres/);
  });

  it("recusa senha só de números", () => {
    const r = criarUsuarioSchema.safeParse({ ...validoCriar, senha: "1234567890" });
    expect(r.success).toBe(false);
  });

  it("recusa papel fora do enum", () => {
    expect(criarUsuarioSchema.safeParse({ ...validoCriar, papel: "gerente" }).success).toBe(false);
  });

  it("unidades default para lista vazia quando ausente (papel admin não precisa informar)", () => {
    const { unidades, ...semUnidades } = validoCriar;
    const r = criarUsuarioSchema.parse({ ...semUnidades, papel: "admin" });
    expect(r.unidades).toEqual([]);
  });
});

describe("atualizarUsuarioSchema", () => {
  it("aceita atualização parcial de um único campo", () => {
    expect(atualizarUsuarioSchema.safeParse({ ativo: false }).success).toBe(true);
    expect(atualizarUsuarioSchema.safeParse({ papel: "admin" }).success).toBe(true);
    expect(atualizarUsuarioSchema.safeParse({ unidades: ["casarao"] }).success).toBe(true);
    expect(atualizarUsuarioSchema.safeParse({ nome: "Novo Nome" }).success).toBe(true);
    expect(atualizarUsuarioSchema.safeParse({ email: "novo@x.com" }).success).toBe(true);
  });

  it("normaliza e-mail para minúsculas na edição, igual à criação", () => {
    const r = atualizarUsuarioSchema.parse({ email: "Corrigido@X.com" });
    expect(r.email).toBe("corrigido@x.com");
  });

  it("recusa e-mail inválido na edição", () => {
    expect(atualizarUsuarioSchema.safeParse({ email: "não-é-email" }).success).toBe(false);
  });

  it("recusa corpo vazio — nada a atualizar não é uma chamada válida", () => {
    const r = atualizarUsuarioSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});
