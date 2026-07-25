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
