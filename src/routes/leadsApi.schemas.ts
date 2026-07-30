import { z } from "zod";
import { STATUS_LEAD } from "../repositories/leads.repo";

export const UNIDADES = [
  "casa_da_arvore",
  "park_lagos",
  "shopping_park_lagos",
  "casarao",
  "casa_por_do_sol",
] as const;

export const idParamSchema = z.string().uuid("id do lead deve ser um UUID");

export const atualizacaoSchema = z
  .object({
    status: z.enum(STATUS_LEAD).optional(),
    unidade_confirmada: z.enum(UNIDADES).optional(),
    /** true devolve a conversa ao bot; false marcaria de volta como humano (não suportado aqui de propósito). */
    devolver_ao_bot: z.literal(true).optional(),
  })
  .refine((dados) => Object.keys(dados).length > 0, {
    message: "informe ao menos um campo: status, unidade_confirmada ou devolver_ao_bot",
  });

export const notaSchema = z.object({
  texto: z.string().trim().min(1, "texto da nota é obrigatório").max(2000),
  /**
   * Preenchido pelo cliente porque a autenticação é uma credencial única
   * compartilhada — não há usuário individual pra derivar o autor. Quando
   * existir login por pessoa, isto deve passar a vir da sessão.
   */
  autor: z.string().trim().max(120).optional(),
});
