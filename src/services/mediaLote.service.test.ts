import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ETAPAS_MIDIA } from "../repositories/mediaLibrary.repo";

const enviarImagem = vi.fn();
const enviarTexto = vi.fn().mockResolvedValue(undefined);
const getEtapaMidiaAtual = vi.fn();
const registrarEnvioMidia = vi.fn().mockResolvedValue(undefined);
const buscarMidias = vi.fn();
const agendarFollowUp = vi.fn().mockResolvedValue(undefined);

vi.mock("./whatsapp.service", () => ({
  sendWhatsAppImage: (...a: unknown[]) => enviarImagem(...a),
  sendWhatsAppVideo: vi.fn(),
  sendWhatsAppDocument: vi.fn(),
  sendWhatsAppMessage: (...a: unknown[]) => enviarTexto(...a),
}));
vi.mock("./followUp.service", () => ({ agendarFollowUp: (...a: unknown[]) => agendarFollowUp(...a) }));
vi.mock("../repositories/conversationState.repo", () => ({
  getEtapaMidiaAtual: (...a: unknown[]) => getEtapaMidiaAtual(...a),
  registrarEnvioMidia: (...a: unknown[]) => registrarEnvioMidia(...a),
}));
vi.mock("../repositories/mediaLibrary.repo", async (importOriginal) => {
  const real = await importOriginal<typeof import("../repositories/mediaLibrary.repo")>();
  return { ETAPAS_MIDIA: real.ETAPAS_MIDIA, buscarMidias: (...a: unknown[]) => buscarMidias(...a) };
});

const { processarMidiaProgressiva } = await import("./mediaEngine.service");

const fotos = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    codigo: `CAS-FOT-EVE-GER-${String(i + 1).padStart(2, "0")}`,
    unidade: "casarao",
    tipo: "foto",
    categoria: "evento",
    perfil_lead: null,
    url: `https://x/${i + 1}.jpg`,
  }));

/**
 * Avança a etapa 2 -> 3 com sinal positivo, que é o caminho do lote de fotos.
 *
 * O envio pausa entre fotos, então com timer real 15 fotos levariam 6s e
 * estourariam o timeout do vitest. Com timer falso, `runAllTimersAsync` vai
 * alternando entre liberar as pausas e deixar o laço prosseguir, o que também
 * torna o teste determinístico: sem isso, um teste que estoura o tempo continua
 * enviando fotos durante o teste seguinte.
 */
async function dispararEtapa3(): Promise<void> {
  const promessa = processarMidiaProgressiva("5522999", "lead-1", "casamento", "casarao", {}, 80, "positivo");
  await vi.runAllTimersAsync();
  await promessa;
}

describe("lote de fotos da etapa 3", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    enviarImagem.mockResolvedValue(undefined);
    getEtapaMidiaAtual.mockResolvedValue(2);
    buscarMidias.mockResolvedValue(fotos(15));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a etapa 3 está configurada para 15 fotos", () => {
    expect(ETAPAS_MIDIA[3].quantidade).toBe(15);
  });

  it("envia as 15 fotos e registra a etapa", async () => {
    await dispararEtapa3();

    expect(enviarImagem).toHaveBeenCalledTimes(15);
    expect(registrarEnvioMidia).toHaveBeenCalledWith("lead-1", 3);
  });

  it("pede à biblioteca exatamente o limite da etapa", async () => {
    await dispararEtapa3();
    expect(buscarMidias.mock.calls[0][4]).toBe(15);
  });

  /**
   * O ponto crítico do lote grande. Se uma falha abortasse o envio, a etapa não
   * seria registrada e a mensagem seguinte do cliente reenviaria o lote inteiro
   * — ele receberia as primeiras fotos duas vezes.
   */
  it("falha em UMA foto não aborta o lote nem impede o registro da etapa", async () => {
    enviarImagem
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("timeout da Meta"))
      .mockResolvedValue(undefined);

    await dispararEtapa3();

    // 15 tentativas: a falha da 3ª não interrompe as 12 seguintes.
    expect(enviarImagem).toHaveBeenCalledTimes(15);
    expect(registrarEnvioMidia).toHaveBeenCalledWith("lead-1", 3);
  });

  it("se TODAS as fotos falharem, a etapa não é registrada (para poder tentar de novo)", async () => {
    enviarImagem.mockRejectedValue(new Error("token inválido"));

    await dispararEtapa3();

    expect(registrarEnvioMidia).not.toHaveBeenCalled();
  });

  it("biblioteca menor que o limite envia só o que existe, sem erro", async () => {
    buscarMidias.mockResolvedValue(fotos(3));

    await dispararEtapa3();

    expect(enviarImagem).toHaveBeenCalledTimes(3);
    expect(registrarEnvioMidia).toHaveBeenCalledWith("lead-1", 3);
  });
});
