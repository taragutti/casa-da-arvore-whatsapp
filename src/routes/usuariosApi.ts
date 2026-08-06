import { Router, Request, Response } from "express";
import { logger } from "../config/logger";
import { exigirLogin, exigirAdmin } from "../middleware/auth";
import { comErro } from "../middleware/asyncHandler";
import { hashSenha } from "../services/password.service";
import {
  buscarPorEmailComHash,
  buscarPorId,
  criarUsuario,
  atualizarPapel,
  atualizarAtivo,
  atualizarPerfil,
  removerUsuario,
  definirUnidadesDoUsuario,
  contarAdminsAtivos,
  listarUsuariosComUnidades,
} from "../repositories/usuarios.repo";
import { idParamSchema, criarUsuarioSchema, atualizarUsuarioSchema } from "./usuariosApi.schemas";

export const usuariosApiRouter = Router();

/** GET /api/usuarios — gestão de contas (estágio 3, admin-only). */
usuariosApiRouter.get(
  "/api/usuarios",
  comErro(exigirLogin),
  comErro(exigirAdmin),
  comErro(async (_req: Request, res: Response) => {
    res.json(await listarUsuariosComUnidades());
  })
);

/** POST /api/usuarios — cria uma conta. Substitui `npm run criar-usuario` como caminho principal. */
usuariosApiRouter.post(
  "/api/usuarios",
  comErro(exigirLogin),
  comErro(exigirAdmin),
  comErro(async (req: Request, res: Response) => {
    const parsed = criarUsuarioSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ erro: parsed.error.issues[0]?.message });
      return;
    }
    const { email, nome, senha, papel } = parsed.data;

    if (await buscarPorEmailComHash(email)) {
      res.status(409).json({ erro: `Já existe usuário com o e-mail ${email}.` });
      return;
    }

    const hash = await hashSenha(senha);
    const usuario = await criarUsuario(email, nome, hash, papel);

    // Unidade só é gravada pra atendente — zera de propósito pra admin, senão
    // uma unidade enviada por engano ficaria órfã sem efeito nenhum até o dia
    // em que essa conta virasse atendente e a lista reaparecesse do nada.
    const unidades = papel === "atendente" ? parsed.data.unidades : [];
    if (unidades.length > 0) await definirUnidadesDoUsuario(usuario.id, unidades);

    logger.info(
      { criadoId: usuario.id, email, papel, unidades, usuarioId: req.autor?.usuarioId, autor: req.autor?.nome },
      "usuário criado pelo painel"
    );
    res.status(201).json({ ...usuario, unidades });
  })
);

/**
 * PATCH /api/usuarios/:id — altera nome, e-mail, papel, unidades e/ou ativo.
 *
 * Trava a última coisa que poderia deixar o sistema sem ninguém pra
 * administrar: rebaixar ou desativar o único admin ativo restante. Sem essa
 * checagem, o próprio admin apagaria o acesso de todo mundo a configurações,
 * mídia e gestão de usuários — inclusive o dele.
 */
usuariosApiRouter.patch(
  "/api/usuarios/:id",
  comErro(exigirLogin),
  comErro(exigirAdmin),
  comErro(async (req: Request, res: Response) => {
    const idResult = idParamSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(400).json({ erro: idResult.error.issues[0]?.message });
      return;
    }
    const usuarioId = idResult.data;

    const parsed = atualizarUsuarioSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ erro: parsed.error.issues[0]?.message });
      return;
    }

    const alvo = await buscarPorId(usuarioId);
    if (!alvo) {
      res.status(404).json({ erro: "usuário não encontrado" });
      return;
    }

    const { nome, email, papel, unidades, ativo } = parsed.data;
    const papelFinal = papel ?? alvo.papel;
    const ativoFinal = ativo ?? alvo.ativo;
    const continuaAdminAtivo = papelFinal === "admin" && ativoFinal;

    if (!continuaAdminAtivo && alvo.papel === "admin" && alvo.ativo) {
      const outrosAdmins = await contarAdminsAtivos(usuarioId);
      if (outrosAdmins === 0) {
        res.status(400).json({ erro: "Não é possível remover o último administrador ativo do sistema." });
        return;
      }
    }

    if (email !== undefined && email.toLowerCase() !== alvo.email.toLowerCase()) {
      const outro = await buscarPorEmailComHash(email);
      if (outro && outro.id !== usuarioId) {
        res.status(409).json({ erro: `Já existe usuário com o e-mail ${email}.` });
        return;
      }
    }

    if (nome !== undefined || email !== undefined) await atualizarPerfil(usuarioId, { nome, email });
    if (papel !== undefined) await atualizarPapel(usuarioId, papel);
    if (ativo !== undefined) await atualizarAtivo(usuarioId, ativo);

    // Unidade só é lida pra atendente — se o papel final for admin (já
    // existente ou definido nesta mesma chamada), zera a lista em vez de
    // gravar algo que nunca seria usado.
    if (unidades !== undefined) {
      await definirUnidadesDoUsuario(usuarioId, papelFinal === "atendente" ? unidades : []);
    } else if (papel === "admin") {
      await definirUnidadesDoUsuario(usuarioId, []);
    }

    logger.info(
      { alteradoId: usuarioId, nome, email, papel, ativo, unidades, usuarioId: req.autor?.usuarioId, autor: req.autor?.nome },
      "usuário alterado pelo painel"
    );
    res.json({ ok: true, usuarioId });
  })
);

/**
 * DELETE /api/usuarios/:id — exclusão de verdade, não desativação.
 *
 * Duas travas: não deixa o sistema sem nenhum admin ativo (mesma checagem do
 * PATCH), e não deixa ninguém excluir a própria conta enquanto logado com ela
 * (a sessão ficaria referenciando um usuário que não existe mais). Usuário
 * com notas registradas também não sai: a constraint em
 * `lead_notes.autor_usuario_id` recusa a query, e aqui isso vira mensagem
 * clara em vez de 500 — a saída correta pra esse caso é desativar, não excluir.
 */
usuariosApiRouter.delete(
  "/api/usuarios/:id",
  comErro(exigirLogin),
  comErro(exigirAdmin),
  comErro(async (req: Request, res: Response) => {
    const idResult = idParamSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(400).json({ erro: idResult.error.issues[0]?.message });
      return;
    }
    const usuarioId = idResult.data;

    if (usuarioId === req.autor?.usuarioId) {
      res.status(400).json({ erro: "Não é possível excluir a própria conta." });
      return;
    }

    const alvo = await buscarPorId(usuarioId);
    if (!alvo) {
      res.status(404).json({ erro: "usuário não encontrado" });
      return;
    }

    if (alvo.papel === "admin" && alvo.ativo) {
      const outrosAdmins = await contarAdminsAtivos(usuarioId);
      if (outrosAdmins === 0) {
        res.status(400).json({ erro: "Não é possível excluir o último administrador ativo do sistema." });
        return;
      }
    }

    try {
      await removerUsuario(usuarioId);
    } catch (error) {
      // 23503 = violação de foreign key (Postgres) — este usuário assinou nota(s).
      if ((error as { code?: string }).code === "23503") {
        res.status(409).json({
          erro: "Este usuário já tem histórico registrado (notas em leads) e não pode ser excluído — desative a conta em vez de excluir.",
        });
        return;
      }
      throw error;
    }

    logger.info(
      { removidoId: usuarioId, email: alvo.email, usuarioId: req.autor?.usuarioId, autor: req.autor?.nome },
      "usuário excluído pelo painel"
    );
    res.json({ ok: true, usuarioId });
  })
);
