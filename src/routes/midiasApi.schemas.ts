import { z } from "zod";
import { UNIDADES } from "./leadsApi.schemas";

/**
 * Perfis de lead aceitos na curadoria de mídia. Espelham exatamente o que
 * mediaEngine.service.ts (`inferirPerfilLead`) sabe inferir hoje — cadastrar
 * mídia com um perfil que o motor nunca produz criaria material que jamais é
 * enviado, e a tela não teria como avisar.
 *
 * "geral" é o caso comum: vale para qualquer perfil, gravado como NULL.
 */
export const PERFIS_LEAD = ["geral", "infantil_pequeno", "infantil_grande", "destination"] as const;

export const ETAPAS = ["1", "2", "3", "4"] as const;

/**
 * Metadados do upload vêm na query string porque o corpo da requisição é o
 * binário puro do arquivo.
 *
 * Optamos por corpo binário em vez de multipart/form-data para não adicionar
 * dependência de parser (multer) à imagem de produção: o `fetch` do navegador
 * envia um File como corpo com o Content-Type correto sem nenhuma ginástica, e
 * o express.raw resolve o resto. Mesmo motivo pelo qual auth.ts tem parser de
 * cookie próprio em vez de cookie-parser.
 */
export const uploadQuerySchema = z.object({
  unidade: z.enum(UNIDADES, { message: "unidade inválida" }),
  etapa: z.enum(ETAPAS, { message: "etapa deve ser 1, 2, 3 ou 4" }),
  perfil_lead: z.enum(PERFIS_LEAD).optional().default("geral"),
});

export const codigoParamSchema = z
  .string()
  .regex(/^[A-Z0-9-]{5,60}$/, "código de mídia inválido");

export const ativoSchema = z.object({
  ativo: z.boolean({ message: "informe ativo: true ou false" }),
});

/** Converte "geral" no NULL que o banco e o motor de mídia esperam. */
export function perfilParaBanco(perfil: (typeof PERFIS_LEAD)[number]): string | null {
  return perfil === "geral" ? null : perfil;
}
