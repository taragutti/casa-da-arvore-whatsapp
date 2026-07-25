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

/**
 * Busca mídias ativas por unidade/tipo/categoria, priorizando as com
 * perfil_lead compatível quando informado (Seção 4, curadoria por perfil).
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
     ORDER BY CASE WHEN perfil_lead = $4 THEN 0 ELSE 1 END, codigo ASC
     LIMIT $5`,
    [unidade, tipo, categoria, perfilLead, limite]
  );
  return result.rows;
}
