import { describe, it, expect } from "vitest";
import { hashSenha, verificarSenha, validarForcaSenha } from "./password.service";

describe("hashSenha / verificarSenha", () => {
  it("aceita a senha correta", async () => {
    const hash = await hashSenha("senha-bem-longa-123");
    expect(await verificarSenha("senha-bem-longa-123", hash)).toBe(true);
  });

  it("recusa senha errada", async () => {
    const hash = await hashSenha("senha-bem-longa-123");
    expect(await verificarSenha("senha-bem-longa-124", hash)).toBe(false);
    expect(await verificarSenha("", hash)).toBe(false);
  });

  it("nunca guarda a senha em texto claro no hash", async () => {
    const hash = await hashSenha("BatataFrita2026");
    expect(hash).not.toContain("BatataFrita2026");
  });

  it("gera hashes diferentes para a mesma senha (salt aleatório)", async () => {
    const a = await hashSenha("mesma-senha-aqui");
    const b = await hashSenha("mesma-senha-aqui");
    expect(a).not.toBe(b);
    // Ambos continuam válidos — o salt está embutido em cada um.
    expect(await verificarSenha("mesma-senha-aqui", a)).toBe(true);
    expect(await verificarSenha("mesma-senha-aqui", b)).toBe(true);
  });

  it("grava os parâmetros no próprio hash, pra poder endurecê-los sem invalidar senhas antigas", async () => {
    const hash = await hashSenha("qualquer-senha-longa");
    const [algo, N, r, p] = hash.split("$");
    expect(algo).toBe("scrypt");
    expect(Number(N)).toBeGreaterThanOrEqual(16384);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });

  it("verifica corretamente um hash com parâmetros diferentes dos atuais", async () => {
    // Simula hash antigo, gerado com custo menor: precisa continuar validando.
    const crypto = await import("crypto");
    const salt = crypto.randomBytes(16);
    const derivada = crypto.scryptSync("senha-antiga-longa", salt, 64, { N: 1024, r: 8, p: 1 });
    const hashAntigo = `scrypt$1024$8$1$${salt.toString("hex")}$${derivada.toString("hex")}`;

    expect(await verificarSenha("senha-antiga-longa", hashAntigo)).toBe(true);
    expect(await verificarSenha("outra-senha", hashAntigo)).toBe(false);
  });

  it("não quebra com hash corrompido ou em formato desconhecido", async () => {
    for (const ruim of ["", "abc", "scrypt$só$isso", "bcrypt$1$2$3$4$5", "scrypt$x$y$z$aa$bb", "scrypt$16384$8$1$$"]) {
      expect(await verificarSenha("qualquer", ruim), ruim).toBe(false);
    }
  });
});

describe("validarForcaSenha", () => {
  it("aprova senha com 10+ caracteres", () => {
    expect(validarForcaSenha("dez-caract")).toBeNull();
  });

  it("recusa senha curta", () => {
    expect(validarForcaSenha("curta")).toContain("10 caracteres");
  });

  it("recusa senha só de números, mesmo longa", () => {
    expect(validarForcaSenha("12345678901234")).toContain("só números");
  });
});
