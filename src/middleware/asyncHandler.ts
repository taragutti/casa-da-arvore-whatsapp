import { Request, Response, NextFunction, RequestHandler } from "express";
import { logger } from "../config/logger";

/**
 * Express 4 não entende Promise rejeitada: se um handler `async` lança, a
 * rejeição fica sem tratamento e o Node encerra o processo inteiro.
 *
 * Isso não é hipotético — durante o desenvolvimento uma query que falhou dentro
 * do middleware de autenticação derrubou o servidor, junto com os workers da
 * fila e os jobs agendados. Uma indisponibilidade momentânea do Postgres numa
 * requisição de painel teria o mesmo efeito em produção.
 *
 * Envolver o handler transforma a falha em erro de requisição (500), que só
 * afeta aquela requisição.
 */
export function comErro(handler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** Último middleware da cadeia: registra o erro e responde sem vazar detalhe interno. */
export function tratarErros(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  logger.error({ err, method: req.method, path: req.path }, "erro não tratado em requisição");

  if (res.headersSent) {
    // Resposta já começou a ser enviada: só encerra, sem tentar escrever corpo novo.
    res.end();
    return;
  }

  const querHtml = req.accepts(["html", "json"]) === "html";
  if (querHtml) {
    res.status(500).set("Content-Type", "text/html; charset=utf-8").send("<h1>Erro interno</h1>");
    return;
  }
  res.status(500).json({ erro: "Erro interno." });
}
