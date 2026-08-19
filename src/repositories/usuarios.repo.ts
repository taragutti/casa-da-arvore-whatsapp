import { pool } from "../db/client";
import { UnidadeRecomendada } from "../services/routing.service";

export type PapelUsuario = "admin" | "atendente";

export interface Usuario {
  id: string;
  email: string;
  nome: string;
  ativo: boolean;
  papel: PapelUsuario;
  telefone: string | null;
}

interface UsuarioComHash extends Usuario {
  senha_hash: string;
}

/** Busca por e-mail para o login. Case-insensitive: ninguém deve falhar o login por causa de maiúscula. */
export async function buscarPorEmailComHash(email: string): Promise<UsuarioComHash | null> {
  const result = await pool.query<UsuarioComHash>(
    `SELECT id, email, nome, ativo, papel, telefone, senha_hash FROM usuarios WHERE lower(email) = lower($1)`,
    [email]
  );
  return result.rows[0] ?? null;
}

export async function buscarPorId(id: string): Promise<Usuario | null> {
  const result = await pool.query<Usuario>(
    `SELECT id, email, nome, ativo, papel, telefone FROM usuarios WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function criarUsuario(
  email: string,
  nome: string,
  senhaHash: string,
  papel: PapelUsuario,
  telefone: string | null = null
): Promise<Usuario> {
  const result = await pool.query<Usuario>(
    `INSERT INTO usuarios (email, nome, senha_hash, papel, telefone) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, nome, ativo, papel, telefone`,
    [email, nome, senhaHash, papel, telefone]
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

export interface UsuarioComUnidades extends Usuario {
  created_at: string;
  ultimo_login_em: string | null;
  unidades: UnidadeRecomendada[];
}

/**
 * Lista para a tela de gestão de usuários (estágio 3, admin-only). As
 * unidades vêm agregadas numa segunda query em lote pelo mesmo motivo das
 * notas do painel de leads: evitar N consultas para montar a página.
 */
export async function listarUsuariosComUnidades(): Promise<UsuarioComUnidades[]> {
  const usuarios = await pool.query<Omit<UsuarioComUnidades, "unidades">>(
    `SELECT id, email, nome, ativo, papel, telefone, created_at, ultimo_login_em FROM usuarios ORDER BY nome`
  );
  if (usuarios.rows.length === 0) return [];

  const unidades = await pool.query<{ usuario_id: string; unidade: UnidadeRecomendada }>(
    `SELECT usuario_id, unidade FROM usuario_unidades WHERE usuario_id = ANY($1)`,
    [usuarios.rows.map((u) => u.id)]
  );
  const porUsuario = new Map<string, UnidadeRecomendada[]>();
  for (const linha of unidades.rows) {
    const lista = porUsuario.get(linha.usuario_id) ?? [];
    lista.push(linha.unidade);
    porUsuario.set(linha.usuario_id, lista);
  }

  return usuarios.rows.map((u) => ({ ...u, unidades: porUsuario.get(u.id) ?? [] }));
}

export async function listarUnidadesDoUsuario(usuarioId: string): Promise<UnidadeRecomendada[]> {
  const result = await pool.query<{ unidade: UnidadeRecomendada }>(
    `SELECT unidade FROM usuario_unidades WHERE usuario_id = $1`,
    [usuarioId]
  );
  return result.rows.map((r) => r.unidade);
}

/**
 * Substitui a lista de unidades do usuário por inteiro (DELETE + INSERT em
 * vez de diff): mais simples e a lista nunca passa de 5 itens, não há ganho
 * real em calcular a diferença.
 */
export async function definirUnidadesDoUsuario(usuarioId: string, unidades: UnidadeRecomendada[]): Promise<void> {
  await pool.query(`DELETE FROM usuario_unidades WHERE usuario_id = $1`, [usuarioId]);
  if (unidades.length === 0) return;

  const valores = unidades.map((_, i) => `($1, $${i + 2})`).join(", ");
  await pool.query(`INSERT INTO usuario_unidades (usuario_id, unidade) VALUES ${valores}`, [usuarioId, ...unidades]);
}

export async function atualizarPapel(usuarioId: string, papel: PapelUsuario): Promise<void> {
  await pool.query(`UPDATE usuarios SET papel = $2 WHERE id = $1`, [usuarioId, papel]);
}

export async function atualizarAtivo(usuarioId: string, ativo: boolean): Promise<void> {
  await pool.query(`UPDATE usuarios SET ativo = $2 WHERE id = $1`, [usuarioId, ativo]);
}

export async function atualizarPerfil(
  usuarioId: string,
  dados: { nome?: string; email?: string; telefone?: string | null }
): Promise<void> {
  const campos: string[] = [];
  const valores: unknown[] = [usuarioId];
  if (dados.nome !== undefined) {
    campos.push(`nome = $${valores.length + 1}`);
    valores.push(dados.nome);
  }
  if (dados.email !== undefined) {
    campos.push(`email = $${valores.length + 1}`);
    valores.push(dados.email);
  }
  if (dados.telefone !== undefined) {
    campos.push(`telefone = $${valores.length + 1}`);
    valores.push(dados.telefone);
  }
  if (campos.length === 0) return;

  await pool.query(`UPDATE usuarios SET ${campos.join(", ")} WHERE id = $1`, valores);
}

/**
 * Exclusão de verdade (não soft-delete). Só é chamada depois que a rota já
 * confirmou que não sobra sem admin — a proteção contra "usuário com
 * histórico" vem de graça da constraint em `lead_notes.autor_usuario_id`
 * (sem ON DELETE CASCADE): a query falha com violação de FK, e é a própria
 * rota que traduz isso pra "desative em vez de excluir".
 */
export async function removerUsuario(usuarioId: string): Promise<void> {
  await pool.query(`DELETE FROM usuarios WHERE id = $1`, [usuarioId]);
}

/**
 * Quantos admins ativos existem, opcionalmente excluindo um usuário da conta
 * (usado para checar "e se EU não contar mais" antes de rebaixar/desativar).
 * Usado para impedir que o sistema fique sem nenhum admin — ninguém mais
 * conseguiria acessar configurações, mídia ou gestão de usuários depois disso.
 */
export async function contarAdminsAtivos(excluirUsuarioId?: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*) FROM usuarios WHERE ativo = true AND papel = 'admin' AND id != COALESCE($1, '00000000-0000-0000-0000-000000000000'::uuid)`,
    [excluirUsuarioId ?? null]
  );
  return Number(result.rows[0].count);
}

export async function listarUsuarios(): Promise<Usuario[]> {
  const result = await pool.query<Usuario>(
    `SELECT id, email, nome, ativo, papel, telefone FROM usuarios ORDER BY nome`
  );
  return result.rows;
}
