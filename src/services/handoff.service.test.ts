import { describe, it, expect } from "vitest";
import { detectarGatilhoHandoff, calcularSlaMinutos, dentroDoHorarioComercial } from "./handoff.service";

describe("detectarGatilhoHandoff", () => {
  it("detecta reclamação e marca para o gerente", () => {
    const decisao = detectarGatilhoHandoff("Estou muito insatisfeito com o atendimento", "neutro", 0);
    expect(decisao).toEqual({ gatilho: "reclamacao", paraGerente: true });
  });

  it("detecta pedido explícito de humano/consultor", () => {
    expect(detectarGatilhoHandoff("Quero falar com um consultor, por favor", "neutro", 0)).toEqual({
      gatilho: "pedido_humano",
      paraGerente: false,
    });
  });

  it("detecta pedido de fechamento/contrato", () => {
    expect(detectarGatilhoHandoff("Já decidi, quero fechar com vocês", "positivo", 0)).toEqual({
      gatilho: "pedido_contrato",
      paraGerente: false,
    });
  });

  it("sinal pedido_visita dispara handoff", () => {
    expect(detectarGatilhoHandoff("Posso ir aí conhecer o espaço?", "pedido_visita", 0)).toEqual({
      gatilho: "pedido_visita",
      paraGerente: false,
    });
  });

  it("sinal pergunta_valor dispara handoff", () => {
    expect(detectarGatilhoHandoff("Quanto fica o pacote fechado?", "pergunta_valor", 0)).toEqual({
      gatilho: "pergunta_valor",
      paraGerente: false,
    });
  });

  it("2 tentativas seguidas sem classificação dispara handoff por fallback", () => {
    expect(detectarGatilhoHandoff("mensagem confusa qualquer", "neutro", 2)).toEqual({
      gatilho: "falha_classificacao_repetida",
      paraGerente: false,
    });
  });

  it("1 tentativa sem classificação ainda não dispara", () => {
    expect(detectarGatilhoHandoff("mensagem confusa qualquer", "neutro", 1)).toBeNull();
  });

  it("mensagem comum sem nenhum gatilho retorna null", () => {
    expect(detectarGatilhoHandoff("Oi, adorei as fotos!", "positivo", 0)).toBeNull();
  });

  it("reclamação tem prioridade sobre outros gatilhos na mesma mensagem", () => {
    const decisao = detectarGatilhoHandoff(
      "Isso é um absurdo, quero falar com um consultor AGORA",
      "neutro",
      0
    );
    expect(decisao?.gatilho).toBe("reclamacao");
    expect(decisao?.paraGerente).toBe(true);
  });
});

describe("calcularSlaMinutos", () => {
  it("Casa da Árvore, Park Lagos e Casarão -> 15 min", () => {
    expect(calcularSlaMinutos("casa_da_arvore", null)).toBe(15);
    expect(calcularSlaMinutos("park_lagos", null)).toBe(15);
    expect(calcularSlaMinutos("casarao", null)).toBe(15);
  });

  it("Casa Pôr do Sol -> 20 min", () => {
    expect(calcularSlaMinutos("casa_por_do_sol", "casamento")).toBe(20);
  });

  it("Shopping Park Lagos -> 30 min", () => {
    expect(calcularSlaMinutos("shopping_park_lagos", "recreacao_avulsa")).toBe(30);
  });

  it("ramo corporativo -> 10 min, mesmo roteando pro Casarão", () => {
    expect(calcularSlaMinutos("casarao", "corporativo")).toBe(10);
  });

  it("sem unidade decidida -> 15 min de fallback", () => {
    expect(calcularSlaMinutos(null, "outro")).toBe(15);
  });
});

describe("dentroDoHorarioComercial", () => {
  it("dentro do expediente num dia útil (terça, 14h Brasília)", () => {
    // 2026-07-28 é terça-feira; 14h em Brasília (UTC-3) = 17h UTC
    expect(dentroDoHorarioComercial(new Date("2026-07-28T17:00:00Z"))).toBe(true);
  });

  it("fora do expediente, à noite num dia útil (terça, 19h Brasília)", () => {
    expect(dentroDoHorarioComercial(new Date("2026-07-28T22:00:00Z"))).toBe(false);
  });

  it("domingo, mesmo em horário comercial -> false", () => {
    // 2026-08-02 é domingo; 14h Brasília = 17h UTC
    expect(dentroDoHorarioComercial(new Date("2026-08-02T17:00:00Z"))).toBe(false);
  });

  it("sábado em horário comercial -> true (Seção 5 assume seg-sáb)", () => {
    // 2026-08-01 é sábado; 14h Brasília = 17h UTC
    expect(dentroDoHorarioComercial(new Date("2026-08-01T17:00:00Z"))).toBe(true);
  });
});
