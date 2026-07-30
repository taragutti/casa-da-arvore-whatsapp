import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// O envio só acontece com token/phone configurados — define antes de importar
// o módulo, porque config/env.ts valida na importação.
process.env.WHATSAPP_ACCESS_TOKEN = "token-de-teste";
process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";

const { sendWhatsAppTemplate } = await import("./whatsapp.service");

function corpoDaChamada(mock: ReturnType<typeof vi.fn>): any {
  return JSON.parse(mock.mock.calls[0][1].body);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "{}" });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendWhatsAppTemplate — formato do payload", () => {
  it("template SEM variáveis omite o componente body (a Meta rejeita parameters vazio)", async () => {
    await sendWhatsAppTemplate("+5522997546818", "followup_2h", []);

    const corpo = corpoDaChamada(fetchMock);
    expect(corpo.type).toBe("template");
    expect(corpo.template.name).toBe("followup_2h");
    expect(corpo.template).not.toHaveProperty("components");
  });

  it("template COM variáveis envia body com os parâmetros na ordem recebida", async () => {
    await sendWhatsAppTemplate("+5522997546818", "handoff_vendedor", ["um", "dois", "três"]);

    const corpo = corpoDaChamada(fetchMock);
    expect(corpo.template.components).toHaveLength(1);
    expect(corpo.template.components[0].type).toBe("body");
    expect(corpo.template.components[0].parameters).toEqual([
      { type: "text", text: "um" },
      { type: "text", text: "dois" },
      { type: "text", text: "três" },
    ]);
  });

  it("remove o + do número, como a Cloud API espera", async () => {
    await sendWhatsAppTemplate("+5522997546818", "followup_2h", []);
    expect(corpoDaChamada(fetchMock).to).toBe("5522997546818");
  });

  it("usa pt_BR como idioma padrão", async () => {
    await sendWhatsAppTemplate("+5522997546818", "followup_2h", []);
    expect(corpoDaChamada(fetchMock).template.language).toEqual({ code: "pt_BR" });
  });

  it("erro da Meta vira WhatsAppTemplateError com o código preservado", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { code: 132001, message: "Template does not exist" } }),
    });

    await expect(sendWhatsAppTemplate("+5522997546818", "nao_existe", [])).rejects.toMatchObject({
      name: "WhatsAppTemplateError",
      metaCode: 132001,
      ehProblemaDeTemplate: true,
    });
  });
});
