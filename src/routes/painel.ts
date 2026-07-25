import crypto from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { buscarLeadsParaPainel } from "../repositories/painel.repo";
import { renderizarPainelHtml } from "../services/painel.service";

export const painelRouter = Router();

function compararSeguro(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * HTTP Basic Auth (Seção 7). Se as credenciais não estiverem configuradas,
 * a rota fica DESATIVADA (503) — nunca aberta sem senha, já que expõe dados
 * pessoais de leads (nome, telefone, detalhes do evento).
 */
function autenticarPainel(req: Request, res: Response, next: NextFunction): void {
  if (!env.PAINEL_USERNAME || !env.PAINEL_PASSWORD) {
    res.status(503).send("Painel não configurado — defina PAINEL_USERNAME e PAINEL_PASSWORD.");
    return;
  }

  const auth = req.header("authorization");
  const negar = () => {
    res.set("WWW-Authenticate", 'Basic realm="Painel Casa da Árvore"');
    res.status(401).send("Autenticação necessária.");
  };

  if (!auth?.startsWith("Basic ")) {
    negar();
    return;
  }

  const decodificado = Buffer.from(auth.slice("Basic ".length), "base64").toString("utf8");
  const separador = decodificado.indexOf(":");
  if (separador === -1) {
    negar();
    return;
  }

  const usuario = decodificado.slice(0, separador);
  const senha = decodificado.slice(separador + 1);

  if (!compararSeguro(usuario, env.PAINEL_USERNAME) || !compararSeguro(senha, env.PAINEL_PASSWORD)) {
    negar();
    return;
  }

  next();
}

/** GET /painel — painel mínimo de visibilidade sobre os campos de CRM consolidados (Seção 7). */
painelRouter.get("/painel", autenticarPainel, async (_req: Request, res: Response) => {
  const leads = await buscarLeadsParaPainel();
  res.set("Content-Type", "text/html; charset=utf-8").send(renderizarPainelHtml(leads));
});
