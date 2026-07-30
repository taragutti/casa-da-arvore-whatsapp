import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().default("3000"),
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  INGEST_API_KEY: z.string().min(1, "INGEST_API_KEY é obrigatório"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5"),
  RESEND_API_KEY: z.string().optional(),
  BRIEFING_RECIPIENT_EMAIL: z.string().optional(),
  // Destinatário das notificações de handoff (Seção 5) — "dia 1" da
  // especificação: um único e-mail pra todos os handoffs, ainda sem
  // diretório de consultor por unidade. Cai pra BRIEFING_RECIPIENT_EMAIL
  // se não configurado.
  HANDOFF_NOTIFICATION_EMAIL: z.string().optional(),

  // Número de WhatsApp do vendedor que recebe o lead no handoff (Seção 5),
  // em formato internacional (ex: +5522997546818). Se não configurado, o
  // handoff continua notificando só por e-mail.
  //
  // ATENÇÃO: enviar pra este número é uma mensagem iniciada pela empresa —
  // a Meta só permite texto livre dentro de 24h da última mensagem que o
  // vendedor mandou pro número do bot. Fora dessa janela, o envio falha
  // (logado, sem quebrar o pipeline) até existir um template aprovado.
  VENDEDOR_WHATSAPP_NUMBER: z.string().optional(),

  // Nome do template aprovado na Meta pra notificação de handoff. Quando
  // definido, a notificação do vendedor sai por template (funciona fora da
  // janela de 24h); quando ausente, sai como texto livre (só funciona dentro
  // da janela). O corpo exato que precisa ser aprovado está documentado em
  // services/whatsapp.service.ts (CORPO_TEMPLATE_HANDOFF) — a ordem das
  // variáveis é acoplada, não mude um lado sem o outro.
  VENDEDOR_HANDOFF_TEMPLATE_NAME: z.string().optional(),

  // WhatsApp Business Cloud API (Meta) — usado só pelo webhook de teste em
  // /webhooks/whatsapp. O endpoint genérico /api/leads/ingest não depende disso.
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),

  // Painel mínimo de visibilidade (Seção 7) — HTTP Basic Auth. Se qualquer
  // um dos dois faltar, a rota fica desativada (503) em vez de abrir sem
  // autenticação: o painel expõe dados pessoais de leads (nome, telefone,
  // detalhes do evento), então "sem credencial configurada" tem que
  // significar "bloqueado", nunca "público".
  PAINEL_USERNAME: z.string().optional(),
  PAINEL_PASSWORD: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variáveis de ambiente inválidas:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  PORT: Number(parsed.data.PORT),
};
