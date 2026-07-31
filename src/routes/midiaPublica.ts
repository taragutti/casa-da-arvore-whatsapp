import path from "path";
import { Router, Request, Response } from "express";
import { comErro } from "../middleware/asyncHandler";
import { logger } from "../config/logger";
import { caminhoAbsoluto, diretorioBase, nomeArquivoSeguro } from "../services/mediaStorage.service";

export const midiaPublicaRouter = Router();

/**
 * Content-Type explícito por extensão. `res.sendFile` já deduz pela extensão,
 * mas a Meta rejeita mídia cujo Content-Type não corresponde ao tipo declarado
 * na mensagem, então vale ser explícito em vez de depender do mapa do Express.
 */
const CONTENT_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".3gp": "video/3gpp",
  ".pdf": "application/pdf",
};

/**
 * GET /midia/:arquivo — entrega o binário da biblioteca de mídia.
 *
 * SEM AUTENTICAÇÃO, e isso é necessário, não um esquecimento: quem baixa este
 * arquivo é o servidor da Meta, que recebe apenas a URL (whatsapp.service.ts
 * envia `{ link: url }`) e não tem como apresentar cookie de sessão nem Basic
 * Auth. Rota autenticada aqui significaria toda mídia falhando no envio.
 *
 * O que é exposto: fotos, vídeos e catálogos institucionais — material de
 * divulgação, que já é público por natureza. Nenhum dado de lead passa por
 * aqui. Ainda assim o nome só é aceito no formato que nós mesmos geramos, para
 * que a rota não vire um leitor de arquivos arbitrários do container.
 */
midiaPublicaRouter.get("/midia/:arquivo", comErro(async (req: Request, res: Response) => {
  const nome = nomeArquivoSeguro(req.params.arquivo ?? "");
  if (!nome) {
    logger.warn({ solicitado: req.params.arquivo }, "nome de arquivo de mídia recusado");
    res.status(400).json({ erro: "Nome de arquivo inválido." });
    return;
  }

  const caminho = caminhoAbsoluto(nome);

  // Cinto e suspensório: mesmo com o nome validado, confirma que o caminho
  // resolvido continua dentro do diretório de mídia.
  if (!caminho.startsWith(diretorioBase() + path.sep)) {
    res.status(400).json({ erro: "Nome de arquivo inválido." });
    return;
  }

  const contentType = CONTENT_TYPE[path.extname(nome).toLowerCase()];
  if (contentType) res.type(contentType);

  // Material institucional muda pouco e a Meta pode baixar o mesmo arquivo
  // muitas vezes ao dia. Uma troca de foto gera código novo (portanto URL
  // nova), então cache longo não corre risco de servir versão velha.
  res.set("Cache-Control", "public, max-age=86400");

  res.sendFile(caminho, (erro) => {
    if (!erro) return;

    const codigo = (erro as NodeJS.ErrnoException).code;
    if (codigo === "ENOENT") {
      // Registro no banco apontando pra arquivo inexistente: acontece se o
      // volume não estiver montado (disco do container é efêmero). Log em
      // nível de aviso porque é exatamente o sintoma dessa má configuração.
      logger.warn({ nome }, "arquivo de mídia não encontrado no disco — volume montado?");
      if (!res.headersSent) res.status(404).json({ erro: "Arquivo não encontrado." });
      return;
    }

    logger.error({ err: erro, nome }, "falha ao servir arquivo de mídia");
    if (!res.headersSent) res.status(500).json({ erro: "Erro ao ler arquivo." });
  });
}));
