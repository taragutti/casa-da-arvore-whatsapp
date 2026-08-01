import { describe, it, expect, vi, afterEach } from "vitest";
import { periodoDoDia, montarSaudacao } from "./saudacao.service";

/**
 * Datas em UTC com o horário de Brasília (UTC-3) comentado ao lado. Testar em
 * UTC seria testar a coisa errada: o servidor roda em UTC e o cliente está no
 * Brasil, então é justamente a conversão que precisa estar certa.
 */
describe("período do dia (fuso de Brasília)", () => {
  it("de manhã até meio-dia: bom dia", () => {
    expect(periodoDoDia(new Date("2026-08-01T09:00:00Z"))).toBe("bom dia"); // 06:00 BRT
    expect(periodoDoDia(new Date("2026-08-01T14:59:00Z"))).toBe("bom dia"); // 11:59 BRT
  });

  it("de meio-dia às 18h: boa tarde", () => {
    expect(periodoDoDia(new Date("2026-08-01T15:00:00Z"))).toBe("boa tarde"); // 12:00 BRT
    expect(periodoDoDia(new Date("2026-08-01T20:59:00Z"))).toBe("boa tarde"); // 17:59 BRT
  });

  it("após 18h: boa noite", () => {
    expect(periodoDoDia(new Date("2026-08-01T21:00:00Z"))).toBe("boa noite"); // 18:00 BRT
    expect(periodoDoDia(new Date("2026-08-02T02:00:00Z"))).toBe("boa noite"); // 23:00 BRT
  });

  it("madrugada conta como bom dia, não sobra sem período", () => {
    expect(periodoDoDia(new Date("2026-08-01T05:00:00Z"))).toBe("bom dia"); // 02:00 BRT
  });

  /**
   * O caso que erraria em 3 horas se o fuso não fosse forçado: 22h em Brasília
   * é 01h do dia seguinte em UTC. Sem timeZone, viraria "bom dia" à noite.
   */
  it("22h em Brasília é boa noite, mesmo sendo outro dia em UTC", () => {
    const data = new Date("2026-08-02T01:00:00Z");
    expect(data.getUTCHours()).toBe(1); // confirma que em UTC já é 1h
    expect(periodoDoDia(data)).toBe("boa noite");
  });
});

describe("texto da saudação", () => {
  afterEach(() => vi.useRealTimers());

  it("inclui o período, a identificação e um convite a dizer o evento", () => {
    const texto = montarSaudacao(new Date("2026-08-01T15:30:00Z")); // 12:30 BRT
    expect(texto).toContain("boa tarde");
    expect(texto).toMatch(/assistente virtual/i);
    expect(texto).toMatch(/Casa da Árvore/);
    expect(texto).toMatch(/que tipo de evento/i);
  });

  it("não menciona preço nem prazo — isso é papel do vendedor", () => {
    const texto = montarSaudacao();
    expect(texto).not.toMatch(/preço|valor|orçamento|R\$/i);
  });
});
