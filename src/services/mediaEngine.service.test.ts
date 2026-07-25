import { describe, it, expect } from "vitest";
import { decidirProximaAcaoMidia } from "./mediaEngine.service";

describe("decidirProximaAcaoMidia", () => {
  it("primeira mensagem (etapa null) sempre envia a etapa 1, independente do sinal", () => {
    expect(decidirProximaAcaoMidia("infantil", null, "neutro")).toEqual({ tipo: "enviar", etapa: 1 });
    expect(decidirProximaAcaoMidia("casamento", null, "negativo")).toEqual({ tipo: "enviar", etapa: 1 });
  });

  it("sinal positivo avança uma etapa por vez", () => {
    expect(decidirProximaAcaoMidia("infantil", 1, "positivo")).toEqual({ tipo: "enviar", etapa: 2 });
    expect(decidirProximaAcaoMidia("infantil", 2, "positivo")).toEqual({ tipo: "enviar", etapa: 3 });
    expect(decidirProximaAcaoMidia("infantil", 3, "positivo")).toEqual({ tipo: "enviar", etapa: 4 });
  });

  it("sinal negativo ou neutro não avança a régua", () => {
    expect(decidirProximaAcaoMidia("infantil", 1, "negativo")).toEqual({ tipo: "nenhuma" });
    expect(decidirProximaAcaoMidia("infantil", 2, "neutro")).toEqual({ tipo: "nenhuma" });
  });

  it("pedido_visita não avança a régua de mídia (é gatilho de handoff, Seção 5, não desta seção)", () => {
    expect(decidirProximaAcaoMidia("infantil", 1, "pedido_visita")).toEqual({ tipo: "nenhuma" });
  });

  it("pergunta_valor pula direto pra etapa 4, de qualquer etapa atual", () => {
    expect(decidirProximaAcaoMidia("infantil", 1, "pergunta_valor")).toEqual({ tipo: "enviar", etapa: 4 });
    expect(decidirProximaAcaoMidia("casamento", 2, "pergunta_valor")).toEqual({ tipo: "enviar", etapa: 4 });
  });

  it("etapa 4 já enviada -> aguardar_handoff, mesmo com sinal positivo", () => {
    expect(decidirProximaAcaoMidia("infantil", 4, "positivo")).toEqual({ tipo: "aguardar_handoff" });
    expect(decidirProximaAcaoMidia("infantil", 4, "pergunta_valor")).toEqual({ tipo: "aguardar_handoff" });
  });

  describe("exceção corporativo (Ramo D, Seção 4)", () => {
    it("primeira mensagem envia etapa 1 normalmente", () => {
      expect(decidirProximaAcaoMidia("corporativo", null, "neutro")).toEqual({ tipo: "enviar", etapa: 1 });
    });

    it("de qualquer etapa intermediária, pula direto pras etapas 3+4 comprimidas (etapa 4), sem esperar sinal", () => {
      expect(decidirProximaAcaoMidia("corporativo", 1, "neutro")).toEqual({ tipo: "enviar", etapa: 4 });
      expect(decidirProximaAcaoMidia("corporativo", 2, "negativo")).toEqual({ tipo: "enviar", etapa: 4 });
    });

    it("etapa 4 já enviada -> aguardar_handoff", () => {
      expect(decidirProximaAcaoMidia("corporativo", 4, "neutro")).toEqual({ tipo: "aguardar_handoff" });
    });
  });
});
