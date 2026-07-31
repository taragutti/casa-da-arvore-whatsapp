import { Router, Request, Response } from "express";
import { logger } from "../config/logger";
import { exigirLogin } from "../middleware/auth";
import { comErro } from "../middleware/asyncHandler";
import { buscarConfiguracoes, salvarConfiguracoes, CONFIGURACOES_PADRAO } from "../repositories/configuracoes.repo";
import { invalidarCacheConfig } from "../services/config.service";
import { configSchema } from "./configApi.schemas";

export const configApiRouter = Router();

configApiRouter.get(
  "/api/configuracoes",
  comErro(exigirLogin),
  comErro(async (_req: Request, res: Response) => {
    res.json((await buscarConfiguracoes()) ?? CONFIGURACOES_PADRAO);
  })
);

configApiRouter.put(
  "/api/configuracoes",
  comErro(exigirLogin),
  comErro(async (req: Request, res: Response) => {
    const parsed = configSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ erro: parsed.error.issues[0]?.message });
      return;
    }

    const autor = req.autor!;
    const salvo = await salvarConfiguracoes(parsed.data, autor.usuarioId);

    // Sem isto, a tela mostraria o valor novo mas o motor seguiria usando o
    // antigo até o TTL do cache expirar — e quem salvou concluiria que não
    // funcionou.
    invalidarCacheConfig();

    logger.info(
      { usuarioId: autor.usuarioId, autor: autor.nome },
      "configuração de workflow alterada"
    );
    res.json(salvo);
  })
);
