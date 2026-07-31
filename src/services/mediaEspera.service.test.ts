import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks declarados antes do import do módulo sob teste (hoisting do vi.mock).
const enviarImagem = vi.fn().mockResolvedValue(undefined);
const enviarTexto = vi.fn().mockResolvedValue(undefined);
const agendarFollowUp = vi.fn().mockResolvedValue(undefined);
const getEtapaMidiaAtual = vi.fn();
const registrarEnvioMidia = vi.fn().mockResolvedValue(undefined);
const buscarMidias = vi.fn();

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

const { enviarMidiaDeEspera } = await import("./mediaEngine.service");

const FOTO = [{ codigo: "CDA-EXT-01", unidade: "casarao", tipo: "foto", categoria: "externa", perfil_lead: null, url: "https://x/1.jpg" }];

describe("enviarMidiaDeEspera (mídia de espera no handoff)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEtapaMidiaAtual.mockResolvedValue(null);
    buscarMidias.mockResolvedValue(FOTO);
  });

  it("envia a foto da etapa 1 e avisa que o consultor vai chamar", async () => {
    await enviarMidiaDeEspera("5522999", "lead-1", "casamento", "casarao", {}, null);

    expect(enviarImagem).toHaveBeenCalledOnce();
    expect(enviarTexto).toHaveBeenCalledOnce();
    expect(enviarTexto.mock.calls[0][1]).toMatch(/consultor/i);
    expect(registrarEnvioMidia).toHaveBeenCalledWith("lead-1", 1);
  });

  /**
   * O ponto crítico desta função. Agendar follow-up aqui faria o bot cobrar em
   * 2h um cliente que o vendedor já está atendendo — atropelando a conversa
   * humana. Se alguém trocar esta função por processarMidiaProgressiva por
   * engano, este teste quebra.
   */
  it("NUNCA agenda follow-up — o lead agora é do vendedor, não do bot", async () => {
    await enviarMidiaDeEspera("5522999", "lead-1", "casamento", "casarao", {}, null);
    expect(agendarFollowUp).not.toHaveBeenCalled();
  });

  it("não envia nada se o lead já recebeu mídia antes do handoff", async () => {
    getEtapaMidiaAtual.mockResolvedValue(2);
    await enviarMidiaDeEspera("5522999", "lead-1", "casamento", "casarao", {}, null);

    expect(enviarImagem).not.toHaveBeenCalled();
    expect(enviarTexto).not.toHaveBeenCalled();
  });

  it("não envia nada sem unidade definida (não há como escolher a foto)", async () => {
    await enviarMidiaDeEspera("5522999", "lead-1", "casamento", null, {}, null);
    expect(enviarImagem).not.toHaveBeenCalled();
  });

  it("unidade sem foto de etapa 1 não gera erro nem texto órfão", async () => {
    buscarMidias.mockResolvedValue([]);
    await enviarMidiaDeEspera("5522999", "lead-1", "casamento", "casa_por_do_sol", {}, null);

    expect(enviarImagem).not.toHaveBeenCalled();
    // Sem foto, o aviso "olha só como é o espaço" não faz sentido sozinho.
    expect(enviarTexto).not.toHaveBeenCalled();
    expect(registrarEnvioMidia).not.toHaveBeenCalled();
  });

  it("falha no aviso de texto não desfaz a foto já enviada", async () => {
    enviarTexto.mockRejectedValueOnce(new Error("janela de 24h fechada"));
    await expect(enviarMidiaDeEspera("5522999", "lead-1", "casamento", "casarao", {}, null)).resolves.toBeUndefined();
    expect(registrarEnvioMidia).toHaveBeenCalledWith("lead-1", 1);
  });
});
