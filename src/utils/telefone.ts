import { z } from "zod";

/**
 * Formato internacional que o resto do código já assume em toda parte que
 * lida com WhatsApp (ex.: `+5522997546818`) — código do país + DDD + número,
 * sem espaço, parêntese ou hífen. Recusar aqui evita salvar um número que o
 * envio à Meta rejeitaria só na hora do envio real.
 */
export const telefoneWhatsapp = (rotulo: string) =>
  z
    .string({ message: `${rotulo}: informe um número de WhatsApp` })
    .trim()
    .regex(/^\+\d{12,13}$/, `${rotulo}: use o formato internacional, ex: +5522997546818`);

/** Mesmo formato, mas opcional — para campos que podem ficar sem telefone (ex.: usuário sem celular pessoal). */
export const telefoneWhatsappOpcional = (rotulo: string) =>
  z
    .union([telefoneWhatsapp(rotulo), z.literal(""), z.null()])
    .transform((v) => (v ? v : null))
    .optional();
