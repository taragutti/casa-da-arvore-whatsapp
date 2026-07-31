import { Router, Request, Response } from "express";
import { exigirLogin } from "../middleware/auth";
import { comErro } from "../middleware/asyncHandler";
import { buscarLeadsParaPainel } from "../repositories/painel.repo";
import { renderizarPainelHtml } from "../services/painel.service";

export const painelRouter = Router();

/** GET /painel — painel mínimo de visibilidade sobre os campos de CRM consolidados (Seção 7). */
painelRouter.get("/painel", comErro(exigirLogin), comErro(async (req: Request, res: Response) => {
  const leads = await buscarLeadsParaPainel();
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderizarPainelHtml(leads, req.autor!));
}));
