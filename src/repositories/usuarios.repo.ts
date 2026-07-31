import { pool } from "../db/client";

export interface Usuario {
  id: string;
  email: string;
  nome: string;
  ativo: boolean;
}

interface UsuarioComHash extends Usuario {
  senha_hash: string;
}

/** Busca por e-mail para o login. Case-insensitive: ninguém deve falhar o login por causa de maiúscula. */
export async function buscarPorEmailComHash(email: string): Promise<UsuarioComHash | null> {
  const result = await pool.query<UsuarioComHash>(
    `SELECT id, email, nome, ativo, senha_hash FROM usuarios WHERE lower(email) = lower($1)`,
    [email]
  );
  return result.rows[0] ?? null;
}

export async function buscarPorId(id: string): Promise<Usuario | null> {
  const result = await pool.query<Usuario>(`SELECT id, email, nome, ativo FROM usuarios WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function criarUsuario(email: string, nome: string, senhaHash: string): Promise<Usuario> {
  const result = await pool.query<Usuario>(
    `INSERT INTO usuarios (email, nome, senha_hash) VALUES ($1, $2, $3)
     RETURNING id, email, nome, ativo`,
    [email, nome, senhaHash]
  );
  return result.rows[0];
}

export async function registrarLogin(id: string): Promise<void> {
  await pool.query(`UPDATE usuarios SET ultimo_login_em = now() WHERE id = $1`, [id]);
}

/**
 * Usado pelo fallback de bootstrap: enquanto não existir nenhum usuário ativo,
 * a credencial compartilhada continua valendo, senão não haveria como entrar
 * no sistema para criar o primeiro usuário.
 */
export async function existeUsuarioAtivo(): Promise<boolean> {
  const result = await pool.query(`SELECT 1 FROM usuarios WHERE ativo = true LIMIT 1`);
  return (result.rowCount ?? 0) > 0;
}

export async function listarUsuarios(): Promise<Usuario[]> {
  const result = await pool.query<Usuario>(`SELECT id, email, nome, ativo FROM usuarios ORDER BY nome`);
  return result.rows;
}
