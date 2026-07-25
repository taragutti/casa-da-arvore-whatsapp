-- Schema Casa da Árvore — Automação Comercial e Inteligência de Demanda
-- Versão sem WhatsApp Cloud API direto: dados chegam via endpoint de ingestão genérico
-- (alimentado pela automação existente no Make / ecossistema WhatsApp já em uso)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. raw_messages: guarda o payload bruto recebido no endpoint de ingestão,
--    para auditoria e reprocessamento caso a extração falhe.
CREATE TABLE IF NOT EXISTS raw_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  whatsapp_number TEXT NOT NULL,
  mensagem_original TEXT NOT NULL,
  payload_bruto JSONB NOT NULL,
  processado BOOLEAN NOT NULL DEFAULT false,
  erro TEXT
);

-- 2. leads: funil comercial
CREATE TYPE tipo_evento_enum AS ENUM (
  'aniversario_infantil', 'casamento', 'debutante', 'corporativo', 'cha_de_bebe', 'outro'
);

CREATE TYPE status_lead_enum AS ENUM (
  'novo', 'qualificando', 'proposta_enviada', 'negociacao', 'fechado', 'perdido'
);

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  whatsapp_number TEXT NOT NULL UNIQUE,
  nome_cliente TEXT,
  tipo_evento tipo_evento_enum,
  data_evento DATE,
  numero_convidados INTEGER,
  orcamento_mencionado NUMERIC,
  origem TEXT NOT NULL DEFAULT 'whatsapp',
  status status_lead_enum NOT NULL DEFAULT 'novo',
  ultima_interacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  resumo_pedido TEXT
);

-- 3. demand_signals: sinais qualitativos por interação
CREATE TYPE gatilho_emocional_enum AS ENUM (
  'economia', 'exclusividade', 'tranquilidade', 'status', 'praticidade', 'outro'
);

CREATE TABLE IF NOT EXISTS demand_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tipo_evento tipo_evento_enum,
  palavras_chave TEXT[],
  objecao_ou_duvida TEXT,
  gatilho_emocional gatilho_emocional_enum,
  mensagem_original TEXT NOT NULL
);

-- 4. monthly_briefings: briefing agregado mensal
CREATE TABLE IF NOT EXISTS monthly_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo TEXT NOT NULL, -- formato AAAA-MM
  gerado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  conteudo_json JSONB NOT NULL,
  enviado BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_demand_signals_lead_id ON demand_signals(lead_id);
CREATE INDEX IF NOT EXISTS idx_demand_signals_created_at ON demand_signals(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_number ON leads(whatsapp_number);
CREATE INDEX IF NOT EXISTS idx_raw_messages_processado ON raw_messages(processado);
