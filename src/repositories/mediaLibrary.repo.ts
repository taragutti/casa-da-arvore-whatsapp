import { pool } from "../db/client";
import { UnidadeRecomendada } from "../services/routing.service";

export type TipoMidia = "foto" | "video" | "catalogo" | "cupom";
export type CategoriaMidia = "externa" | "evento" | "tour" | "catalogo";

export interface MediaItem {
  codigo: string;
  unidade: UnidadeRecomendada;
  tipo: TipoMidia;
  categoria: CategoriaMidia;
  perfil_lead: string | null;
  url: string;
}

/** Item com os campos de gestão, usado pela tela de mídias do painel. */
export interface MediaItemAdmin extends MediaItem {
  ativo: boolean;
}

/**
 * As 4 etapas da régua de mídia progressiva (Seção 4) e o que cada uma envia.
 *
 * Esta tabela é a ÚNICA definição de etapa → (tipo, categoria): o motor de
 * mídia consulta a biblioteca por ela e o painel cadastra por ela. Se as duas
 * pontas tivessem cópias próprias, uma foto cadastrada como "etapa 2" no
 * painel poderia nunca ser encontrada pelo motor, e o sintoma (mídia
 * cadastrada que não é enviada) é dos mais difíceis de diagnosticar.
 */
export const ETAPAS_MIDIA = {
  1: { tipo: "foto", categoria: "externa", quantidade: 1, rotulo: "Etapa 1 — foto externa (fachada/área)" },
  2: { tipo: "video", categoria: "tour", quantidade: 1, rotulo: "Etapa 2 — vídeo de tour (15–30s)" },
  3: { tipo: "foto", categoria: "evento", quantidade: 15, rotulo: "Etapa 3 — fotos de eventos reais (até 15)" },
  4: { tipo: "catalogo", categoria: "catalogo", quantidade: 1, rotulo: "Etapa 4 — catálogo em PDF" },
} as const satisfies Record<number, { tipo: TipoMidia; categoria: CategoriaMidia; quantidade: number; rotulo: string }>;

/**
 * Busca mídias ativas por unidade/tipo/categoria, priorizando as com
 * perfil_lead compatível quando informado (Seção 4, curadoria por perfil).
 *
 * O sorteio (`random()`) vem DEPOIS da prioridade de perfil, então material
 * curado para o perfil do lead continua vindo primeiro — o sorteio só decide a
 * ordem dentro de cada grupo. Sem ele a ordenação era fixa por código, e
 * biblioteca maior que o limite da etapa teria sempre o mesmo excedente morto:
 * as fotos do fim da lista nunca seriam enviadas a ninguém.
 */
export async function buscarMidias(
  unidade: UnidadeRecomendada,
  tipo: TipoMidia,
  categoria: CategoriaMidia,
  perfilLead: string | null,
  limite: number
): Promise<MediaItem[]> {
  const result = await pool.query<MediaItem>(
    `SELECT codigo, unidade, tipo, categoria, perfil_lead, url
     FROM media_library
     WHERE unidade = $1 AND tipo = $2 AND categoria = $3 AND ativo = true
     ORDER BY CASE WHEN perfil_lead = $4 THEN 0 ELSE 1 END, random()
     LIMIT $5`,
    [unidade, tipo, categoria, perfilLead, limite]
  );
  return result.rows;
}

/** Lista tudo (inclusive inativas) para a tela de gestão. */
export async function listarTodasMidias(): Promise<MediaItemAdmin[]> {
  const result = await pool.query<MediaItemAdmin>(
    `SELECT codigo, unidade, tipo, categoria, perfil_lead, url, ativo
     FROM media_library
     ORDER BY unidade ASC, tipo ASC, categoria ASC, codigo ASC`
  );
  return result.rows;
}

export async function buscarMidiaPorCodigo(codigo: string): Promise<MediaItemAdmin | null> {
  const result = await pool.query<MediaItemAdmin>(
    `SELECT codigo, unidade, tipo, categoria, perfil_lead, url, ativo
     FROM media_library WHERE codigo = $1`,
    [codigo]
  );
  return result.rows[0] ?? null;
}

/**
 * Siglas de 3 letras que compõem o código da mídia. Fixas de propósito:
 * o código é a chave primária e aparece no nome do arquivo em disco, então
 * mudar uma sigla depois renomearia arquivo e quebraria URL já cadastrada.
 */
const SIGLA_UNIDADE: Record<UnidadeRecomendada, string> = {
  casa_da_arvore: "ARV",
  park_lagos: "PKL",
  shopping_park_lagos: "SPL",
  casarao: "CSR",
  casa_por_do_sol: "CPS",
};

const SIGLA_TIPO: Record<TipoMidia, string> = {
  foto: "FOT",
  video: "VID",
  catalogo: "CAT",
  cupom: "CUP",
};

const SIGLA_CATEGORIA: Record<CategoriaMidia, string> = {
  externa: "EXT",
  evento: "EVT",
  tour: "TOU",
  catalogo: "CAT",
};

const SIGLA_PERFIL: Record<string, string> = {
  infantil_grande: "INF-G",
  infantil_pequeno: "INF-P",
  destination: "DST",
};

/**
 * Gera o próximo código livre no padrão do schema (ex.: ARV-FOT-EVT-INF-G-01).
 *
 * O sequencial é calculado a partir do que já existe com o mesmo prefixo, e o
 * INSERT usa a chave primária como rede de segurança: se dois uploads
 * simultâneos calcularem o mesmo número, o segundo falha por conflito e é
 * repetido, em vez de sobrescrever silenciosamente a mídia do primeiro.
 */
export async function gerarProximoCodigo(
  unidade: UnidadeRecomendada,
  tipo: TipoMidia,
  categoria: CategoriaMidia,
  perfilLead: string | null
): Promise<string> {
  const sufixoPerfil = perfilLead ? (SIGLA_PERFIL[perfilLead] ?? perfilLead.slice(0, 3).toUpperCase()) : "GER";
  const prefixo = `${SIGLA_UNIDADE[unidade]}-${SIGLA_TIPO[tipo]}-${SIGLA_CATEGORIA[categoria]}-${sufixoPerfil}`;

  const result = await pool.query<{ codigo: string }>(
    `SELECT codigo FROM media_library WHERE codigo LIKE $1 ORDER BY codigo DESC LIMIT 1`,
    [`${prefixo}-%`]
  );

  const ultimo = result.rows[0]?.codigo;
  const sequencialAtual = ultimo ? Number(ultimo.slice(prefixo.length + 1)) : 0;
  const proximo = (Number.isFinite(sequencialAtual) ? sequencialAtual : 0) + 1;

  return `${prefixo}-${String(proximo).padStart(2, "0")}`;
}

export async function inserirMidia(item: MediaItem): Promise<MediaItemAdmin> {
  const result = await pool.query<MediaItemAdmin>(
    `INSERT INTO media_library (codigo, unidade, tipo, categoria, perfil_lead, url, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, true)
     RETURNING codigo, unidade, tipo, categoria, perfil_lead, url, ativo`,
    [item.codigo, item.unidade, item.tipo, item.categoria, item.perfil_lead, item.url]
  );
  return result.rows[0]!;
}

/** Liga/desliga a mídia sem apagar o arquivo. Retorna false se o código não existe. */
export async function definirMidiaAtiva(codigo: string, ativo: boolean): Promise<boolean> {
  const result = await pool.query(`UPDATE media_library SET ativo = $2 WHERE codigo = $1`, [codigo, ativo]);
  return (result.rowCount ?? 0) > 0;
}

export async function removerMidia(codigo: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM media_library WHERE codigo = $1`, [codigo]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Quantas mídias ATIVAS existem por unidade/tipo/categoria. Alimenta o mapa de
 * cobertura do painel — a pergunta que importa não é "quantos arquivos subi",
 * é "qual unidade ainda tem etapa vazia", porque etapa vazia interrompe a
 * régua de mídia e, com ela, o agendamento de follow-up.
 */
export async function contarMidiasAtivasPorEtapa(): Promise<
  { unidade: UnidadeRecomendada; tipo: TipoMidia; categoria: CategoriaMidia; total: number }[]
> {
  const result = await pool.query<{
    unidade: UnidadeRecomendada;
    tipo: TipoMidia;
    categoria: CategoriaMidia;
    total: string;
  }>(
    `SELECT unidade, tipo, categoria, COUNT(*)::text AS total
     FROM media_library WHERE ativo = true
     GROUP BY unidade, tipo, categoria`
  );
  return result.rows.map((r) => ({ ...r, total: Number(r.total) }));
}
