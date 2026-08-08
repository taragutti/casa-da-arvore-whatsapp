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
    nome_cliente: z.string().trim().min(1, "nome não pode ficar vazio").max(200).optional(),
    /**
     * Aceita "+5522999999999", "55 (22) 99999-9999" etc. e NORMALIZA pra
     * dígitos-only — é assim que o webhook grava (wa_id) e que o resto do
     * sistema (script_state, saudações, relay) chaveia o número. Aceitar um
     * formato e gravar outro quebraria esses vínculos silenciosamente.
     */
    whatsapp_number: z
      .string()
      .trim()
      .transform((v) => v.replace(/\D/g, ""))
      .pipe(
        z
          .string()
          .min(12, "telefone: use o formato internacional, ex: +5522997546818")
          .max(13, "telefone: use o formato internacional, ex: +5522997546818")
      )
      .optional(),
  })
  .refine((dados) => Object.keys(dados).length > 0, {
    message: "informe ao menos um campo: status, unidade_confirmada, nome_cliente, whatsapp_number ou devolver_ao_bot",
  });

/**
 * `autor` NÃO é aceito no corpo de propósito: desde o estágio 2 a autoria vem
 * da sessão. Se o cliente pudesse informá-la, a nota não provaria nada sobre
 * quem realmente escreveu.
 */
export const notaSchema = z.object({
  texto: z.string().trim().min(1, "texto da nota é obrigatório").max(2000),
});

/**
 * Mensagem do chat do painel pro cliente. 4096 é o limite de corpo de texto
 * da própria Cloud API — validar aqui devolve erro legível em vez de deixar a
 * Meta rejeitar com código obscuro.
 */
export const mensagemConversaSchema = z.object({
  texto: z.string().trim().min(1, "mensagem vazia").max(4096, "mensagem longa demais para o WhatsApp (máx. 4096)"),
});
