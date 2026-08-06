import { Router, Request, Response } from "express";
import { exigirLogin, exigirAdmin } from "../middleware/auth";
import { comErro } from "../middleware/asyncHandler";
import { buscarLeadsParaPainel } from "../repositories/painel.repo";
import { renderizarPainelHtml } from "../services/painel.service";
import { contarMidiasAtivasPorEtapa, listarTodasMidias } from "../repositories/mediaLibrary.repo";
import { renderizarPainelMidiasHtml } from "../services/midiasPainel.service";
import { renderizarConfigHtml } from "../services/configPainel.service";
import { buscarConfiguracoes, CONFIGURACOES_PADRAO } from "../repositories/configuracoes.repo";
import { listarUsuariosComUnidades } from "../repositories/usuarios.repo";
import { renderizarUsuariosHtml } from "../services/usuariosPainel.service";

export const painelRouter = Router();

/**
 * GET /painel — painel mínimo de visibilidade sobre os campos de CRM
 * consolidados (Seção 7).
 *
 * Atendente (estágio 3) só vê leads da(s) unidade(s) vinculada(s) a ele; admin
 * vê tudo, sempre. Lead sem unidade decidida ainda continua visível a todo
 * atendente — ver `buscarLeadsParaPainel`.
 */
painelRouter.get("/painel", comErro(exigirLogin), comErro(async (req: Request, res: Response) => {
  const autor = req.autor!;
  const leads = await buscarLeadsParaPainel(autor.papel === "atendente" ? autor.unidades : undefined);
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderizarPainelHtml(leads, autor));
}));

/**
 * GET /painel/midias — gestão da biblioteca de mídia (Seção 4).
 *
 * Rota separada em vez de aba na mesma página: as duas telas não compartilham
 * dado nenhum, e carregar 200 leads para quem só quer trocar uma foto seria
 * desperdício em toda visita.
 */
painelRouter.get("/painel/midias", comErro(exigirLogin), comErro(exigirAdmin), comErro(async (req: Request, res: Response) => {
  const [itens, contagens] = await Promise.all([listarTodasMidias(), contarMidiasAtivasPorEtapa()]);
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderizarPainelMidiasHtml(itens, contagens, req.autor!));
}));

/**
 * GET /painel/configuracoes — prazos, horário, SLA e gatilhos (estágio 8).
 *
 * Cai no padrão do código quando a tabela ainda não existe: mostra os valores
 * padrão em vez de erro, porque a tela é útil para CONSULTAR a regra vigente
 * mesmo antes de alguém decidir mudar algo.
 */
painelRouter.get("/painel/configuracoes", comErro(exigirLogin), comErro(exigirAdmin), comErro(async (req: Request, res: Response) => {
  const config = (await buscarConfiguracoes()) ?? CONFIGURACOES_PADRAO;
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderizarConfigHtml(config, req.autor!));
}));

/**
 * GET /painel/usuarios — gestão de contas e papéis (estágio 3, admin-only).
 * Tela nova: até aqui, criar/desativar usuário só existia via
 * `npm run criar-usuario` no terminal.
 */
painelRouter.get("/painel/usuarios", comErro(exigirLogin), comErro(exigirAdmin), comErro(async (req: Request, res: Response) => {
  const usuarios = await listarUsuariosComUnidades();
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderizarUsuariosHtml(usuarios, req.autor!));
}));
