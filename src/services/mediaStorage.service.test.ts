import { describe, it, expect } from "vitest";
import {
  ArquivoInvalidoError,
  nomeArquivoDaUrl,
  nomeArquivoSeguro,
  validarArquivo,
} from "./mediaStorage.service";

const MB = 1024 * 1024;

describe("validarArquivo", () => {
  it("aceita os formatos que a Meta suporta e devolve a extensão canônica", () => {
    expect(validarArquivo("foto", "image/jpeg", 100)).toBe(".jpg");
    expect(validarArquivo("foto", "image/png", 100)).toBe(".png");
    expect(validarArquivo("video", "video/mp4", 100)).toBe(".mp4");
    expect(validarArquivo("catalogo", "application/pdf", 100)).toBe(".pdf");
  });

  it("ignora parâmetros e caixa no Content-Type", () => {
    expect(validarArquivo("foto", "IMAGE/JPEG; charset=binary", 100)).toBe(".jpg");
  });

  it("recusa formato fora da lista do tipo", () => {
    // GIF é imagem, mas a Cloud API não aceita como `image` — passar daria erro
    // só no envio, longe da causa.
    expect(() => validarArquivo("foto", "image/gif", 100)).toThrow(ArquivoInvalidoError);
    // PDF na etapa de foto: erro de escolha de etapa no painel.
    expect(() => validarArquivo("foto", "application/pdf", 100)).toThrow(ArquivoInvalidoError);
  });

  it("explica o caso do vídeo de iPhone, que é o erro mais provável", () => {
    expect(() => validarArquivo("video", "video/quicktime", 100)).toThrow(/\.mov/);
  });

  it("aplica o limite de tamanho de cada tipo", () => {
    expect(() => validarArquivo("foto", "image/jpeg", 6 * MB)).toThrow(/limite do WhatsApp/);
    expect(() => validarArquivo("video", "video/mp4", 17 * MB)).toThrow(/limite do WhatsApp/);
    // 6MB é inválido como foto e válido como vídeo — o limite é por tipo.
    expect(validarArquivo("video", "video/mp4", 6 * MB)).toBe(".mp4");
  });

  it("recusa arquivo vazio", () => {
    expect(() => validarArquivo("foto", "image/jpeg", 0)).toThrow(/vazio/i);
  });
});

describe("nomeArquivoSeguro", () => {
  it("aceita o formato que nós mesmos geramos", () => {
    expect(nomeArquivoSeguro("ARV-FOT-EVT-INF-G-01.jpg")).toBe("ARV-FOT-EVT-INF-G-01.jpg");
    expect(nomeArquivoSeguro("CSR-CAT-CAT-GER-01.pdf")).toBe("CSR-CAT-CAT-GER-01.pdf");
  });

  it("recusa qualquer tentativa de sair do diretório de mídia", () => {
    expect(nomeArquivoSeguro("../.env")).toBeNull();
    expect(nomeArquivoSeguro("../../etc/passwd")).toBeNull();
    expect(nomeArquivoSeguro("pasta/arquivo.jpg")).toBeNull();
    expect(nomeArquivoSeguro("arquivo.jpg/../../.env")).toBeNull();
    expect(nomeArquivoSeguro("arquivo\0.jpg")).toBeNull();
    expect(nomeArquivoSeguro("")).toBeNull();
    expect(nomeArquivoSeguro("sem-extensao")).toBeNull();
  });
});

describe("nomeArquivoDaUrl", () => {
  it("extrai o nome de uma URL nossa", () => {
    expect(nomeArquivoDaUrl("https://exemplo.up.railway.app/midia/ARV-FOT-EXT-GER-01.jpg")).toBe(
      "ARV-FOT-EXT-GER-01.jpg"
    );
  });

  it("devolve null para URL externa, que não tem arquivo nosso a apagar", () => {
    expect(nomeArquivoDaUrl("https://casadaarvore.com.br/fotos/fachada.jpg")).toBeNull();
  });
});
