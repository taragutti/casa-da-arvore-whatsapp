import fs from "fs/promises";
import path from "path";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { TipoMidia } from "../repositories/mediaLibrary.repo";

/**
 * Armazenamento dos arquivos da biblioteca de mídia (Seção 4).
 *
 * Por que arquivo em disco e não no Postgres: o envio pelo WhatsApp é por
 * `link` (whatsapp.service.ts monta `{ link: url }`), ou seja a Meta baixa o
 * binário do nosso servidor. Guardar bytes no banco exigiria uma rota que os
 * lê e devolve a cada download — mais lento, mais memória, e o banco não é
 * feito pra isso. Disco + rota estática resolve com menos partes móveis.
 *
 * Em produção o diretório PRECISA ser um volume do Railway (ver ENVIRONMENT.md).
 */

/**
 * Tipos aceitos e limite de tamanho, espelhando os limites da Cloud API da
 * Meta. Validar aqui em vez de na hora do envio é deliberado: um arquivo de
 * 20MB entraria na biblioteca sem erro e só falharia semanas depois, no meio
 * de uma conversa com cliente real, com o log de erro longe da causa.
 *
 * Limites da Meta: imagem 5MB, vídeo 16MB, documento 100MB.
 */
interface RegraTipo {
  mimesAceitos: readonly string[];
  limiteBytes: number;
  /** Extensão gravada no disco por MIME — não confiamos no nome que o cliente enviou. */
  extensaoPorMime: Readonly<Record<string, string>>;
}

const MB = 1024 * 1024;

export const REGRAS_POR_TIPO: Readonly<Record<TipoMidia, RegraTipo>> = {
  foto: {
    mimesAceitos: ["image/jpeg", "image/png"],
    limiteBytes: 5 * MB,
    extensaoPorMime: { "image/jpeg": ".jpg", "image/png": ".png" },
  },
  video: {
    // A Meta aceita video/mp4 e video/3gpp. MOV do iPhone NÃO é aceito, e é o
    // caso mais provável de upload aqui — a mensagem de erro precisa dizer isso.
    mimesAceitos: ["video/mp4", "video/3gpp"],
    limiteBytes: 16 * MB,
    extensaoPorMime: { "video/mp4": ".mp4", "video/3gpp": ".3gp" },
  },
  catalogo: {
    mimesAceitos: ["application/pdf"],
    limiteBytes: 100 * MB,
    extensaoPorMime: { "application/pdf": ".pdf" },
  },
  cupom: {
    mimesAceitos: ["image/jpeg", "image/png", "application/pdf"],
    limiteBytes: 5 * MB,
    extensaoPorMime: { "image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf" },
  },
};

export class ArquivoInvalidoError extends Error {}

/** Maior limite entre todos os tipos — usado pelo body parser, que não sabe o tipo ainda. */
export const LIMITE_MAXIMO_BYTES = Math.max(...Object.values(REGRAS_POR_TIPO).map((r) => r.limiteBytes));

function formatarMB(bytes: number): string {
  return `${(bytes / MB).toFixed(bytes < MB ? 2 : 0)}MB`;
}

/**
 * Valida o arquivo contra as regras do tipo e devolve a extensão a usar.
 * Lança ArquivoInvalidoError com mensagem destinada a quem está no painel —
 * não a um desenvolvedor lendo log.
 */
export function validarArquivo(tipo: TipoMidia, mime: string, tamanhoBytes: number): string {
  const regra = REGRAS_POR_TIPO[tipo];

  // Navegador manda "image/jpeg" limpo, mas cliente HTTP qualquer pode mandar
  // "image/jpeg; charset=binary" — comparar a string inteira rejeitaria válido.
  const mimeLimpo = mime.split(";")[0]!.trim().toLowerCase();

  if (!regra.mimesAceitos.includes(mimeLimpo)) {
    const aceitos = regra.mimesAceitos.join(", ");
    const dica =
      tipo === "video" && (mimeLimpo === "video/quicktime" || mimeLimpo === "video/mov")
        ? " Vídeo gravado no iPhone (.mov) precisa ser convertido para .mp4 — o WhatsApp não aceita .mov."
        : "";
    throw new ArquivoInvalidoError(`Formato ${mimeLimpo || "desconhecido"} não aceito para ${tipo}. Aceitos: ${aceitos}.${dica}`);
  }

  if (tamanhoBytes === 0) {
    throw new ArquivoInvalidoError("Arquivo vazio.");
  }

  if (tamanhoBytes > regra.limiteBytes) {
    throw new ArquivoInvalidoError(
      `Arquivo tem ${formatarMB(tamanhoBytes)} e o limite do WhatsApp para ${tipo} é ${formatarMB(regra.limiteBytes)}.`
    );
  }

  return regra.extensaoPorMime[mimeLimpo]!;
}

/**
 * Impede path traversal na rota pública de download. Só aceita o formato que
 * nós mesmos geramos (código + extensão), então qualquer coisa com "/", ".."
 * ou byte estranho é recusada por não casar com o padrão — abordagem de lista
 * de permissão, mais segura que tentar limpar a entrada.
 */
export function nomeArquivoSeguro(nome: string): string | null {
  return /^[A-Za-z0-9-]+\.[a-z0-9]{2,4}$/.test(nome) ? nome : null;
}

export function diretorioBase(): string {
  return path.resolve(env.MEDIA_STORAGE_DIR);
}

export function caminhoAbsoluto(nomeArquivo: string): string {
  return path.join(diretorioBase(), nomeArquivo);
}

/** URL absoluta gravada em media_library.url e entregue à Meta. */
export function urlPublica(nomeArquivo: string): string {
  return `${env.PUBLIC_BASE_URL}/midia/${nomeArquivo}`;
}

export async function garantirDiretorio(): Promise<void> {
  await fs.mkdir(diretorioBase(), { recursive: true });
}

/** Grava o arquivo com nome derivado do código da mídia. Retorna o nome final. */
export async function salvarArquivo(codigo: string, extensao: string, conteudo: Buffer): Promise<string> {
  await garantirDiretorio();
  const nomeArquivo = `${codigo}${extensao}`;
  await fs.writeFile(caminhoAbsoluto(nomeArquivo), conteudo);
  logger.info({ nomeArquivo, bytes: conteudo.length }, "arquivo de mídia gravado");
  return nomeArquivo;
}

/**
 * Apaga o arquivo do disco. Ausência não é erro: se o registro do banco ficou
 * órfão (volume recriado, arquivo removido na mão), o certo é conseguir apagar
 * o registro de qualquer forma, não travar a remoção.
 */
export async function apagarArquivo(nomeArquivo: string): Promise<void> {
  try {
    await fs.unlink(caminhoAbsoluto(nomeArquivo));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      logger.warn({ nomeArquivo }, "arquivo já não existia no disco ao remover mídia");
      return;
    }
    throw error;
  }
}

/**
 * Extrai o nome do arquivo a partir da URL guardada no banco. Mídia cadastrada
 * com URL externa (site próprio, por exemplo) não tem arquivo nosso pra apagar,
 * e aí retorna null.
 */
export function nomeArquivoDaUrl(url: string): string | null {
  const marcador = "/midia/";
  const posicao = url.lastIndexOf(marcador);
  if (posicao === -1) return null;
  return nomeArquivoSeguro(url.slice(posicao + marcador.length));
}
