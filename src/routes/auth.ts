import { Router, Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { COOKIE_SESSAO, lerCookie } from "../middleware/auth";
import { criarSessao, destruirSessao, lerSessao } from "../services/session.service";
import { verificarSenha } from "../services/password.service";
import { buscarPorEmailComHash, registrarLogin, existeUsuarioAtivo } from "../repositories/usuarios.repo";
import { renderizarLoginHtml } from "../services/loginPage.service";
import { comErro } from "../middleware/asyncHandler";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().min(1),
  senha: z.string().min(1),
});

/** Cookie de sessão: HttpOnly (JS da página não lê), SameSite=Lax (bloqueia CSRF de outro site), Secure em produção. */
function definirCookieSessao(res: Response, token: string, duracaoSegundos: number): void {
  res.cookie(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: duracaoSegundos * 1000,
    path: "/",
  });
}

authRouter.get("/login", comErro(async (req: Request, res: Response) => {
  // Já logado não precisa ver a tela de login.
  const token = lerCookie(req, COOKIE_SESSAO);
  if (token && (await lerSessao(token))) {
    res.redirect(302, "/painel");
    return;
  }

  const primeiroAcesso = !(await existeUsuarioAtivo());
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderizarLoginHtml({ erro: null, primeiroAcesso }));
}));

authRouter.post("/login", comErro(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  const primeiroAcesso = !(await existeUsuarioAtivo());

  const recusar = (motivo: string) => {
    // Mensagem genérica de propósito: dizer "e-mail não existe" permitiria
    // descobrir quais e-mails têm conta no sistema.
    logger.warn({ motivo, email: parsed.success ? parsed.data.email : undefined }, "tentativa de login recusada");
    res
      .status(401)
      .set("Content-Type", "text/html; charset=utf-8")
      .send(renderizarLoginHtml({ erro: "E-mail ou senha inválidos.", primeiroAcesso }));
  };

  if (!parsed.success) return recusar("campos ausentes");

  const usuario = await buscarPorEmailComHash(parsed.data.email);
  if (!usuario) return recusar("e-mail não encontrado");
  if (!usuario.ativo) return recusar("usuário desativado");

  if (!(await verificarSenha(parsed.data.senha, usuario.senha_hash))) return recusar("senha incorreta");

  const { token, duracaoSegundos } = await criarSessao(usuario.id);
  await registrarLogin(usuario.id);
  definirCookieSessao(res, token, duracaoSegundos);

  logger.info({ usuarioId: usuario.id, nome: usuario.nome }, "login efetuado");
  res.redirect(302, "/painel");
}));

authRouter.post("/logout", comErro(async (req: Request, res: Response) => {
  const token = lerCookie(req, COOKIE_SESSAO);
  if (token) await destruirSessao(token);
  res.clearCookie(COOKIE_SESSAO, { path: "/" });
  res.redirect(302, "/login");
}));
