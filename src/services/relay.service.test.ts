import { describe, it, expect } from "vitest";
import { interpretarComandoVendedor } from "./relay.service";
import { normalizarNumero } from "../repositories/relay.repo";

describe("interpretarComandoVendedor", () => {
  it("texto normal vira mensagem pro cliente", () => {
    expect(interpretarComandoVendedor("Oi Maria, o pacote sai por R$ 3.500")).toEqual({
      tipo: "texto",
      texto: "Oi Maria, o pacote sai por R$ 3.500",
    });
  });

  it("texto com # no MEIO continua sendo texto (não engole mensagem real)", () => {
    expect(interpretarComandoVendedor("o valor é R$ 2# com desconto").tipo).toBe("texto");
  });

  it("#N seleciona atendimento, com e sem espaço", () => {
    expect(interpretarComandoVendedor("#2")).toEqual({ tipo: "selecionar", posicao: 2 });
    expect(interpretarComandoVendedor(" # 12 ")).toEqual({ tipo: "selecionar", posicao: 12 });
  });

  it("#leads e #lista listam", () => {
    expect(interpretarComandoVendedor("#leads")).toEqual({ tipo: "listar" });
    expect(interpretarComandoVendedor("#LISTA")).toEqual({ tipo: "listar" });
  });

  it("#fim/#encerrar/#fechar encerram", () => {
    for (const c of ["#fim", "#encerrar", "#fechar", "#FIM"]) {
      expect(interpretarComandoVendedor(c)).toEqual({ tipo: "encerrar" });
    }
  });

  it("#bot/#devolver devolvem ao bot", () => {
    expect(interpretarComandoVendedor("#bot")).toEqual({ tipo: "devolver_ao_bot" });
    expect(interpretarComandoVendedor("#devolver")).toEqual({ tipo: "devolver_ao_bot" });
  });

  it("#ajuda e variações mostram ajuda", () => {
    for (const c of ["#ajuda", "#help", "#?"]) {
      expect(interpretarComandoVendedor(c)).toEqual({ tipo: "ajuda" });
    }
  });

  it("comando não reconhecido vira ajuda, NUNCA texto pro cliente", () => {
    // "#fin" (typo de #fim) indo pro cliente exporia a operação interna.
    expect(interpretarComandoVendedor("#fin")).toEqual({ tipo: "ajuda" });
    expect(interpretarComandoVendedor("#qualquercoisa")).toEqual({ tipo: "ajuda" });
  });
});

describe("normalizarNumero", () => {
  it("remove +, espaços e traços — as duas grafias reais convergem", () => {
    expect(normalizarNumero("+55 22 99724-9462")).toBe("5522997249462");
    expect(normalizarNumero("5522997249462")).toBe("5522997249462");
    expect(normalizarNumero("+5522997249462")).toBe(normalizarNumero("5522997249462"));
  });
});
