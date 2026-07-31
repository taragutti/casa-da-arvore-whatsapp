import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CONFIGURACOES_PADRAO } from "../repositories/configuracoes.repo";

const buscarConfiguracoes = vi.fn();

vi.mock("../repositories/configuracoes.repo", async (importOriginal) => {
  const real = await importOriginal<typeof import("../repositories/configuracoes.repo")>();
  return { CONFIGURACOES_PADRAO: real.CONFIGURACOES_PADRAO, buscarConfiguracoes: () => buscarConfiguracoes() };
});

const { obterConfig, invalidarCacheConfig } = await import("./config.service");

const configFalsa = (minutos2h: number) => ({
  ...CONFIGURACOES_PADRAO,
  followUpMinutos: { ...CONFIGURACOES_PADRAO.followUpMinutos, "2h": minutos2h },
});

describe("cache de configuração", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidarCacheConfig();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("consulta o banco uma vez e reaproveita nas chamadas seguintes", async () => {
    buscarConfiguracoes.mockResolvedValue(configFalsa(999));

    const a = await obterConfig();
    const b = await obterConfig();
    const c = await obterConfig();

    expect(buscarConfiguracoes).toHaveBeenCalledTimes(1);
    expect(a.followUpMinutos["2h"]).toBe(999);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("invalidar faz a próxima chamada ir ao banco de novo", async () => {
    buscarConfiguracoes.mockResolvedValue(configFalsa(111));
    await obterConfig();

    buscarConfiguracoes.mockResolvedValue(configFalsa(222));
    invalidarCacheConfig();

    expect((await obterConfig()).followUpMinutos["2h"]).toBe(222);
    expect(buscarConfiguracoes).toHaveBeenCalledTimes(2);
  });

  it("relê depois do TTL, para outras instâncias convergirem", async () => {
    buscarConfiguracoes.mockResolvedValue(configFalsa(1));
    await obterConfig();

    buscarConfiguracoes.mockResolvedValue(configFalsa(2));
    await vi.advanceTimersByTimeAsync(31_000);

    expect((await obterConfig()).followUpMinutos["2h"]).toBe(2);
  });

  /**
   * O ponto mais importante: configuração é lida no processamento de cada
   * mensagem. Se uma falha de banco propagasse daqui, uma indisponibilidade
   * momentânea do Postgres pararia o atendimento inteiro — em vez de apenas
   * usar as regras padrão, que é o comportamento que o sistema tinha antes
   * desta tela existir.
   */
  it("falha de banco NÃO propaga — cai nos padrões", async () => {
    buscarConfiguracoes.mockRejectedValue(new Error("conexão recusada"));

    const config = await obterConfig();

    expect(config).toEqual(CONFIGURACOES_PADRAO);
  });

  it("tabela sem linha também cai nos padrões", async () => {
    buscarConfiguracoes.mockResolvedValue(null);
    expect(await obterConfig()).toEqual(CONFIGURACOES_PADRAO);
  });

  it("depois de falhar, volta a tentar em poucos segundos", async () => {
    buscarConfiguracoes.mockRejectedValue(new Error("caiu"));
    await obterConfig();

    buscarConfiguracoes.mockResolvedValue(configFalsa(77));
    await vi.advanceTimersByTimeAsync(6_000);

    expect((await obterConfig()).followUpMinutos["2h"]).toBe(77);
  });
});
