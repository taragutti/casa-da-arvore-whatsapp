import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

function compararSeguro(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * HTTP Basic Auth compartilhado pelo painel (Seção 7) e pela API de escrita de
 * leads — é a mesma identidade de operador, então dividir credencial só criaria
 * duas fontes de verdade.
 *
 * Se as credenciais não estiverem configuradas, a rota fica DESATIVADA (503),
 * nunca aberta sem senha: essas rotas leem e ALTERAM dados pessoais de leads,
 * então "sem credencial" tem que significar "bloqueado", não "público".
 *
 * Limitação conhecida: é uma credencial única compartilhada, sem usuário
 * individual nem papéis. Por isso `autor` nas notas é preenchido pelo cliente
 * da API, não derivado da autenticação — não há como saber quem de fato agiu.
 */
export function autenticarPainel(req: Request, res: Response, next: NextFunction): void {
  if (!env.PAINEL_USERNAME || !env.PAINEL_PASSWORD) {
    res.status(503).json({ erro: "Painel não configurado — defina PAINEL_USERNAME e PAINEL_PASSWORD." });
    return;
  }

  const auth = req.header("authorization");
  const negar = () => {
    res.set("WWW-Authenticate", 'Basic realm="Painel Casa da Árvore"');
    res.status(401).json({ erro: "Autenticação necessária." });
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
