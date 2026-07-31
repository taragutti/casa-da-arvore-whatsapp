import express, { Router, Request, Response } from "express";
import { logger } from "../config/logger";
import { exigirLogin } from "../middleware/auth";
import { comErro } from "../middleware/asyncHandler";
import {
  ETAPAS_MIDIA,
  buscarMidiaPorCodigo,
  definirMidiaAtiva,
  gerarProximoCodigo,
  inserirMidia,
  listarTodasMidias,
  removerMidia,
} from "../repositories/mediaLibrary.repo";
import {
  ArquivoInvalidoError,
  LIMITE_MAXIMO_BYTES,
  apagarArquivo,
  nomeArquivoDaUrl,
  salvarArquivo,
  urlPublica,
  validarArquivo,
} from "../services/mediaStorage.service";
import { ativoSchema, codigoParamSchema, perfilParaBanco, uploadQuerySchema } from "./midiasApi.schemas";

export const midiasApiRouter = Router();

/**
 * Parser de corpo binário para o upload. `type: () => true` aceita qualquer
 * Content-Type porque a validação de formato é nossa (mediaStorage), e uma
 * lista aqui devolveria corpo vazio em vez de erro explicativo quando alguém
 * subisse .mov — o pior tipo de falha, silenciosa.
 *
 * O limite é o maior entre os tipos; o limite específico do tipo é conferido
 * depois, quando já sabemos se é foto, vídeo ou catálogo.
 */
const corpoBinario = express.raw({ type: () => true, limit: LIMITE_MAXIMO_BYTES });

/** GET /api/midias — biblioteca completa, inclusive itens desativados. */
midiasApiRouter.get("/api/midias", comErro(exigirLogin), comErro(async (_req: Request, res: Response) => {
  res.json(await listarTodasMidias());
}));

/**
 * POST /api/midias?unidade=&etapa=&perfil_lead= — recebe o arquivo e cadastra.
 *
 * A ordem importa: grava o arquivo ANTES do registro no banco e, se o INSERT
 * falhar, apaga o arquivo. O inverso deixaria registro apontando pra arquivo
 * inexistente — e registro órfão é pior que arquivo órfão, porque o motor de
 * mídia trataria como mídia disponível e o envio falharia na Meta.
 */
midiasApiRouter.post(
  "/api/midias",
  comErro(exigirLogin),
  corpoBinario,
  comErro(async (req: Request, res: Response) => {
    const query = uploadQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ erro: query.error.issues[0]?.message });
      return;
    }

    const { unidade, etapa, perfil_lead } = query.data;
    const { tipo, categoria } = ETAPAS_MIDIA[Number(etapa) as 1 | 2 | 3 | 4];
    const perfilLead = perfilParaBanco(perfil_lead);

    // Corpo que não é Buffer significa que outro parser o consumiu antes
    // (json/urlencoded, pelo Content-Type declarado) — ou seja, não veio
    // arquivo binário. Dizer isso é mais útil que "nenhum arquivo recebido".
    const conteudo = req.body;
    if (!Buffer.isBuffer(conteudo)) {
      res.status(400).json({
        erro: "Envie o arquivo como corpo da requisição, com o Content-Type do próprio arquivo (ex.: image/jpeg).",
      });
      return;
    }
    if (conteudo.length === 0) {
      res.status(400).json({ erro: "Arquivo vazio." });
      return;
    }

    let extensao: string;
    try {
      extensao = validarArquivo(tipo, req.header("content-type") ?? "", conteudo.length);
    } catch (error) {
      if (error instanceof ArquivoInvalidoError) {
        res.status(400).json({ erro: error.message });
        return;
      }
      throw error;
    }

    const codigo = await gerarProximoCodigo(unidade, tipo, categoria, perfilLead);
    const nomeArquivo = await salvarArquivo(codigo, extensao, conteudo);

    try {
      const item = await inserirMidia({
        codigo,
        unidade,
        tipo,
        categoria,
        perfil_lead: perfilLead,
        url: urlPublica(nomeArquivo),
      });

      logger.info(
        { codigo, unidade, etapa, bytes: conteudo.length, usuarioId: req.autor?.usuarioId, autor: req.autor?.nome },
        "mídia cadastrada na biblioteca"
      );
      res.status(201).json(item);
    } catch (error) {
      await apagarArquivo(nomeArquivo).catch((falha) =>
        logger.error({ err: falha, nomeArquivo }, "falha ao limpar arquivo após erro no cadastro da mídia")
      );
      throw error;
    }
  })
);

/** PATCH /api/midias/:codigo — ativa ou desativa sem apagar o arquivo. */
midiasApiRouter.patch("/api/midias/:codigo", comErro(exigirLogin), comErro(async (req: Request, res: Response) => {
  const codigo = codigoParamSchema.safeParse(req.params.codigo);
  if (!codigo.success) {
    res.status(400).json({ erro: codigo.error.issues[0]?.message });
    return;
  }

  const corpo = ativoSchema.safeParse(req.body);
  if (!corpo.success) {
    res.status(400).json({ erro: corpo.error.issues[0]?.message });
    return;
  }

  if (!(await definirMidiaAtiva(codigo.data, corpo.data.ativo))) {
    res.status(404).json({ erro: "mídia não encontrada" });
    return;
  }

  logger.info(
    { codigo: codigo.data, ativo: corpo.data.ativo, usuarioId: req.autor?.usuarioId },
    "disponibilidade de mídia alterada"
  );
  res.json({ ok: true, codigo: codigo.data, ativo: corpo.data.ativo });
}));

/** DELETE /api/midias/:codigo — remove registro e arquivo. */
midiasApiRouter.delete("/api/midias/:codigo", comErro(exigirLogin), comErro(async (req: Request, res: Response) => {
  const codigo = codigoParamSchema.safeParse(req.params.codigo);
  if (!codigo.success) {
    res.status(400).json({ erro: codigo.error.issues[0]?.message });
    return;
  }

  const item = await buscarMidiaPorCodigo(codigo.data);
  if (!item) {
    res.status(404).json({ erro: "mídia não encontrada" });
    return;
  }

  // Banco primeiro: se a remoção do arquivo falhar, sobra arquivo sem registro
  // (inofensivo, ninguém aponta pra ele). Na ordem inversa, uma falha no
  // DELETE deixaria registro apontando pra arquivo já apagado.
  await removerMidia(codigo.data);

  const nomeArquivo = nomeArquivoDaUrl(item.url);
  if (nomeArquivo) {
    await apagarArquivo(nomeArquivo).catch((falha) =>
      logger.error({ err: falha, nomeArquivo }, "registro de mídia removido, mas o arquivo permaneceu no disco")
    );
  }

  logger.info({ codigo: codigo.data, usuarioId: req.autor?.usuarioId }, "mídia removida da biblioteca");
  res.json({ ok: true, codigo: codigo.data });
}));
