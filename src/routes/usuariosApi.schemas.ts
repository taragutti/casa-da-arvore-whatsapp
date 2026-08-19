import { z } from "zod";
import { UNIDADES } from "./leadsApi.schemas";
import { validarForcaSenha } from "../services/password.service";
import { telefoneWhatsappOpcional } from "../utils/telefone";

export const idParamSchema = z.string().uuid("id do usuário deve ser um UUID");

export const PAPEIS = ["admin", "atendente"] as const;

const senhaSchema = z.string().superRefine((senha, ctx) => {
  const erro = validarForcaSenha(senha);
  if (erro) ctx.addIssue({ code: z.ZodIssueCode.custom, message: erro });
});

export const criarUsuarioSchema = z.object({
  email: z.string().trim().toLowerCase().email("e-mail inválido"),
  nome: z.string().trim().min(1, "nome é obrigatório").max(200),
  senha: senhaSchema,
  papel: z.enum(PAPEIS),
  // Só faz sentido para 'atendente' — a rota zera silenciosamente para
  // 'admin', então aceitar aqui sem exigir é mais simples que recusar payload
  // que só teria efeito nenhum.
  unidades: z.array(z.enum(UNIDADES)).max(UNIDADES.length).default([]),
  // Celular pessoal — usado pelo resumo diário de leads (opcional: nem todo
  // usuário precisa receber esse resumo).
  telefone: telefoneWhatsappOpcional("Telefone"),
});

export const atualizarUsuarioSchema = z
  .object({
    nome: z.string().trim().min(1, "nome é obrigatório").max(200).optional(),
    email: z.string().trim().toLowerCase().email("e-mail inválido").optional(),
    papel: z.enum(PAPEIS).optional(),
    unidades: z.array(z.enum(UNIDADES)).max(UNIDADES.length).optional(),
    ativo: z.boolean().optional(),
    telefone: telefoneWhatsappOpcional("Telefone"),
  })
  .refine((dados) => Object.keys(dados).length > 0, {
    message: "informe ao menos um campo: nome, email, papel, unidades ou ativo",
  });
