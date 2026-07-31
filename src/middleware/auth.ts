import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { lerSessao } from "../services/session.service";
import { buscarPorId, existeUsuarioAtivo, Usuario } from "../repositories/usuarios.repo";

export const COOKIE_SESSAO = "casa_sessao";

/** Identidade de quem está agindo, anexada à requisição pelo middleware. */
export interface Autor {
  usuarioId: string | null;
  nome: string;
  /** true quando entrou pela credencial compartilhada de bootstrap, não por conta individual. */
  compartilhado: boolean;
}

declare module "express-serve-static-core" {
  interface Request {
    autor?: Autor;
  }
}

/**
 * Parser de cookie próprio — cookie-parser seria uma dependência a mais na
 * imagem de produção para algo que cabe em cinco linhas.
 */
export function lerCookie(req: Request, nome: string): string | null {
  const header = req.header("cookie");
  if (!header) return null;
  for (const parte of header.split(";")) {
    const sep = parte.indexOf("=");
    if (sep === -1) continue;
    if (parte.slice(0, sep).trim() === nome) {
      return decodeURIComponent(parte.slice(sep + 1).trim());
    }
  }
  return null;
}

async function identificar(req: Request): Promise<Autor | null> {
  const token = lerCookie(req, COOKIE_SESSAO);
  if (!token) return null;

  const sessao = await lerSessao(token);
  if (!sessao) return null;

  const usuario = await buscarPorId(sessao.usuarioId);
  // Usuário desativado depois do login: a sessão existe mas o acesso acabou.
  if (!usuario || !usuario.ativo) return null;

  return { usuarioId: usuario.id, nome: usuario.nome, compartilhado: false };
}

/**
 * Exige sessão de usuário individual (estágio 2).
 *
 * Fallback de bootstrap: ENQUANTO não existir nenhum usuário ativo no banco, a
 * credencial compartilhada (PAINEL_USERNAME/PAINEL_PASSWORD) continua aceita —
 * senão não haveria como entrar no sistema para criar o primeiro usuário, e um
 * deploy novo ficaria inacessível. Assim que o primeiro usuário é criado, a
 * credencial compartilhada para de funcionar sozinha, sem precisar de outro
 * deploy ou de remover variável de ambiente.
 */
export async function exigirLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const autor = await identificar(req);
  if (autor) {
    req.autor = autor;
    next();
    return;
  }

  if (!(await existeUsuarioAtivo())) {
    const bootstrap = autenticarBootstrap(req);
    if (bootstrap) {
      logger.warn(
        { path: req.path },
        "acesso pela credencial compartilhada de bootstrap — crie um usuário para encerrar esse modo"
      );
      req.autor = bootstrap;
      next();
      return;
    }
  }

  responderNaoAutenticado(req, res);
}

function autenticarBootstrap(req: Request): Autor | null {
  if (!env.PAINEL_USERNAME || !env.PAINEL_PASSWORD) return null;

  const auth = req.header("authorization");
  if (!auth?.startsWith("Basic ")) return null;

  const decodificado = Buffer.from(auth.slice("Basic ".length), "base64").toString("utf8");
  const sep = decodificado.indexOf(":");
  if (sep === -1) return null;

  const comparar = (a: string, b: string) => {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  };

  if (
    !comparar(decodificado.slice(0, sep), env.PAINEL_USERNAME) ||
    !comparar(decodificado.slice(sep + 1), env.PAINEL_PASSWORD)
  ) {
    return null;
  }

  return { usuarioId: null, nome: "acesso compartilhado (bootstrap)", compartilhado: true };
}

/**
 * Navegador que pediu HTML vai para a tela de login; chamada de API recebe 401
 * em JSON. Sem isso, um fetch com sessão expirada receberia a página de login
 * como se fosse resposta de sucesso.
 */
function responderNaoAutenticado(req: Request, res: Response): void {
  const querHtml = req.accepts(["html", "json"]) === "html";
  if (querHtml && req.method === "GET") {
    res.redirect(302, "/login");
    return;
  }
  res.status(401).json({ erro: "Não autenticado." });
}
