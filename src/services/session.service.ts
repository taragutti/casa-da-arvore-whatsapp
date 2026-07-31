import crypto from "crypto";
import { redisApp } from "../config/redis";

/**
 * Sessões guardadas no Redis, que já está em produção para a fila (BullMQ).
 *
 * Alternativa considerada e recusada: token assinado stateless (tipo JWT) em
 * cookie. Seria menos código, mas não daria para REVOGAR — quando alguém sai da
 * empresa, o acesso tem que morrer na hora, não quando o token expirar. Como o
 * Redis já é dependência, o custo de ter estado é zero.
 */
const PREFIXO = "sessao:";
const DURACAO_SEGUNDOS = 12 * 60 * 60; // 12h: cobre um dia de trabalho, sem sessão eterna

export interface SessaoAtiva {
  usuarioId: string;
}

/** 32 bytes aleatórios: espaço grande o bastante para o token não ser adivinhável. */
function gerarToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function criarSessao(usuarioId: string): Promise<{ token: string; duracaoSegundos: number }> {
  const token = gerarToken();
  await redisApp.set(PREFIXO + token, usuarioId, "EX", DURACAO_SEGUNDOS);
  return { token, duracaoSegundos: DURACAO_SEGUNDOS };
}

/**
 * Renova a expiração a cada uso (sliding window) — quem está trabalhando não é
 * deslogado no meio do expediente; quem parou expira em 12h.
 */
export async function lerSessao(token: string): Promise<SessaoAtiva | null> {
  if (!token) return null;
  const chave = PREFIXO + token;
  const usuarioId = await redisApp.get(chave);
  if (!usuarioId) return null;
  await redisApp.expire(chave, DURACAO_SEGUNDOS);
  return { usuarioId };
}

export async function destruirSessao(token: string): Promise<void> {
  if (!token) return;
  await redisApp.del(PREFIXO + token);
}
