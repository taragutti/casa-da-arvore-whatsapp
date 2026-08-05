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
--    Tipos ficam em blocos DO/EXCEPTION porque este arquivo é reaplicado por
--    inteiro a cada deploy (scripts/migrate.js) — sem isso, o CREATE TYPE de
--    um tipo já existente aborta a transação e nada abaixo dele é aplicado.
DO $$ BEGIN
  CREATE TYPE tipo_evento_enum AS ENUM (
    'aniversario_infantil', 'casamento', 'debutante', 'corporativo', 'cha_de_bebe', 'outro'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE status_lead_enum AS ENUM (
    'novo', 'qualificando', 'proposta_enviada', 'negociacao', 'fechado', 'perdido'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- unidade_enum: as 5 unidades físicas, usadas no roteamento do fluxo de bot
-- (ver Fluxo_Detalhado_Bot_CRM_CasaDaArvore.docx, Seção 2.1)
DO $$ BEGIN
  CREATE TYPE unidade_enum AS ENUM (
    'casa_da_arvore', 'park_lagos', 'shopping_park_lagos', 'casarao', 'casa_por_do_sol'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

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

-- Roteamento e qualificação (Seção 2.1 e 2.3 do fluxo detalhado)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unidade_recomendada unidade_enum;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unidade_confirmada unidade_enum;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE leads ADD COLUMN IF NOT EXISTS origem_lead TEXT;

-- E-mail (Seção 7, campo comum a todos os ramos) — capturado pela extração
-- via IA sempre que aparecer numa mensagem, não só no momento do handoff.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT;

-- 3. demand_signals: sinais qualitativos por interação
DO $$ BEGIN
  CREATE TYPE gatilho_emocional_enum AS ENUM (
    'economia', 'exclusividade', 'tranquilidade', 'status', 'praticidade', 'outro'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

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

-- 5. conversation_state: estado atual do fluxo de bot por lead (1 linha por lead),
--    para o worker saber em que ponto da conversa está sem reprocessar o
--    histórico inteiro a cada mensagem (Seção 2.2 do fluxo detalhado).
CREATE TABLE IF NOT EXISTS conversation_state (
  lead_id UUID PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  ramo TEXT, -- 'infantil' | '15_anos' | 'casamento' | 'corporativo' | 'recreacao_avulsa' | 'outro'
  etapa_atual TEXT NOT NULL DEFAULT 'triagem',
  dados_coletados JSONB NOT NULL DEFAULT '{}',
  aguardando_engajamento_etapa_midia INTEGER, -- 1 a 4, ou null
  ultimo_envio_midia_em TIMESTAMPTZ,
  em_atendimento_humano BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contador de mensagens seguidas sem classificação útil (ramo e tipo_evento
-- nulos) — usado pelo gatilho de handoff "IA não entende 2x seguidas"
-- (Seção 5). Não existe na especificação original; adicionado aqui porque
-- a regra exige memória entre mensagens.
ALTER TABLE conversation_state ADD COLUMN IF NOT EXISTS tentativas_sem_classificacao INTEGER NOT NULL DEFAULT 0;

-- 6. media_library: catálogo de mídias por unidade e perfil de lead, usado
--    pelo motor de mídia progressiva (Seção 2.4 e 4 do fluxo detalhado).
CREATE TABLE IF NOT EXISTS media_library (
  codigo TEXT PRIMARY KEY, -- ex.: 'ARV-FOT-EVT-INF-G-01'
  unidade unidade_enum NOT NULL,
  tipo TEXT NOT NULL, -- 'foto' | 'video' | 'catalogo' | 'cupom'
  categoria TEXT NOT NULL, -- 'externa' | 'evento' | 'tour' | 'catalogo'
  perfil_lead TEXT, -- ex.: 'infantil_grande', 'destination'
  url TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true
);

-- 7. usuarios: contas individuais de quem opera o sistema (estágio 2).
--    Substitui a credencial única compartilhada — sem isso não há como saber
--    QUEM executou cada ação, e `autor` nas notas tinha que ser digitado à mão.
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  -- Desativar em vez de apagar preserva a autoria das notas já escritas.
  ativo BOOLEAN NOT NULL DEFAULT true,
  ultimo_login_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(lower(email));

-- 8. lead_notes: observações escritas por quem atende (vendedor/gerente).
--    Append-only de propósito: nota é registro do que se sabia naquele
--    momento, não campo editável — e é a primeira peça de um histórico
--    unificado por lead.
CREATE TABLE IF NOT EXISTS lead_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  autor TEXT,
  texto TEXT NOT NULL
);

-- Autoria real, derivada da sessão (estágio 2). A coluna `autor` (texto livre)
-- continua existindo porque as notas escritas ANTES da autenticação existir
-- têm o nome digitado à mão — apagá-la perderia esse histórico. Notas novas
-- preenchem as duas: o id para integridade, o texto para leitura sem JOIN.
ALTER TABLE lead_notes ADD COLUMN IF NOT EXISTS autor_usuario_id UUID REFERENCES usuarios(id);

CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON lead_notes(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demand_signals_lead_id ON demand_signals(lead_id);
CREATE INDEX IF NOT EXISTS idx_demand_signals_created_at ON demand_signals(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_number ON leads(whatsapp_number);
CREATE INDEX IF NOT EXISTS idx_raw_messages_processado ON raw_messages(processado);
CREATE INDEX IF NOT EXISTS idx_media_library_unidade ON media_library(unidade);

-- ============================================================================
-- Configurações operacionais do workflow (estágio 8)
--
-- Prazos, horário e gatilhos que antes eram constantes no código. Passam a ser
-- editáveis no painel para que ajuste de operação não dependa de deploy.
--
-- Linha ÚNICA por construção: `id BOOLEAN PRIMARY KEY CHECK (id)` só admite o
-- valor `true`, então um segundo INSERT falha em vez de criar configuração
-- concorrente — sem isso, dois registros divergentes seriam possíveis e qual
-- deles vale passaria a depender da ordenação da consulta.
--
-- Os DEFAULTs repetem os valores que estavam no código, então banco existente
-- passa a se comportar exatamente como antes até alguém editar de propósito.
-- ============================================================================
CREATE TABLE IF NOT EXISTS configuracoes (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),

  -- Régua de silêncio (Seção 6), em MINUTOS. Minuto em vez de ms para o painel
  -- não pedir número de 8 dígitos, e em vez de horas para permitir ajuste fino.
  followup_2h_minutos INT NOT NULL DEFAULT 120,
  followup_48h_minutos INT NOT NULL DEFAULT 2880,
  followup_7d_minutos INT NOT NULL DEFAULT 10080,
  followup_30d_minutos INT NOT NULL DEFAULT 43200,

  -- Reagendamento quando o follow-up cai fora do horário comercial.
  reagendamento_fora_horario_minutos INT NOT NULL DEFAULT 60,

  -- Horário comercial (fuso America/Sao_Paulo).
  hora_abertura INT NOT NULL DEFAULT 9 CHECK (hora_abertura BETWEEN 0 AND 23),
  hora_fechamento INT NOT NULL DEFAULT 18 CHECK (hora_fechamento BETWEEN 1 AND 24),
  atende_domingo BOOLEAN NOT NULL DEFAULT false,
  atende_sabado BOOLEAN NOT NULL DEFAULT true,

  -- SLA de resposta humana pós-handoff, em minutos, por unidade + corporativo.
  sla_minutos JSONB NOT NULL DEFAULT
    '{"casa_da_arvore":15,"park_lagos":15,"casarao":15,"casa_por_do_sol":20,"shopping_park_lagos":30}'::jsonb,
  sla_corporativo_minutos INT NOT NULL DEFAULT 10,
  sla_sem_unidade_minutos INT NOT NULL DEFAULT 15,

  -- Palavras que disparam handoff imediato (Seção 5). Comparadas em minúsculas
  -- por substring, então "consultor" também casa "falar com consultor".
  palavras_reclamacao TEXT[] NOT NULL DEFAULT ARRAY[
    'reclamação','reclamacao','insatisfeito','insatisfeita','péssimo atendimento',
    'pessimo atendimento','decepcionado','decepcionada','quero cancelar','absurdo','descaso'
  ],
  palavras_pedido_humano TEXT[] NOT NULL DEFAULT ARRAY[
    'consultor','vendedor','atendente','pessoa de verdade','ser humano','com humano',
    'com alguém','com alguem'
  ],
  palavras_pedido_contrato TEXT[] NOT NULL DEFAULT ARRAY[
    'quero fechar','fechar contrato','quero contratar','vamos fechar','bora fechar','assinar contrato'
  ],

  -- Quantas mensagens sem classificação antes de mandar pra qualificação humana.
  tentativas_sem_classificacao_limite INT NOT NULL DEFAULT 2,

  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por UUID REFERENCES usuarios(id),

  CONSTRAINT horario_coerente CHECK (hora_fechamento > hora_abertura)
);

-- Números de WhatsApp do vendedor que recebe o handoff, por unidade (dois
-- vendedores reais dividindo por tipo de evento: um para Casarão/Casa Pôr do
-- Sol — casamento, 15 anos, corporativo —, outro para Casa da Árvore/Park
-- Lagos/Shopping Park Lagos — festa infantil e recreação avulsa).
-- ALTER em vez de coluna na CREATE TABLE acima: a tabela já existe em
-- produção desde o estágio 8, e schema.sql é reaplicado por inteiro a cada
-- deploy — só ALTER ... IF NOT EXISTS chega em quem já tem a tabela.
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS vendedor_whatsapp_por_unidade JSONB NOT NULL DEFAULT
  '{"casa_da_arvore":"+5522974052903","park_lagos":"+5522974052903","shopping_park_lagos":"+5522974052903","casarao":"+5522997249462","casa_por_do_sol":"+5522997249462"}'::jsonb;
-- Unidade ainda indefinida (ramo "outro", ou roteamento de casamento sem
-- preferência informada) cai aqui — hoje o mesmo vendedor comercial que
-- recebe casarão/casa pôr do sol.
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS vendedor_whatsapp_padrao TEXT NOT NULL DEFAULT '+5522997249462';

-- Garante a linha única na primeira migração, sem sobrescrever ajuste já feito.
INSERT INTO configuracoes (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Saudações já enviadas
--
-- Quem escreve "oi" ainda não é lead: não há evento, data nem nada a qualificar.
-- Criar lead aqui encheria o painel de registros vazios vindos de engano e
-- spam. Por isso o controle fica em tabela própria, com a chave sendo o número
-- — não depende de lead existir.
--
-- Existe para a saudação não se repetir: sem ela, quem manda "oi", "bom dia" e
-- "tudo bem?" em sequência receberia três apresentações idênticas.
-- ============================================================================
CREATE TABLE IF NOT EXISTS saudacoes_enviadas (
  whatsapp_number TEXT PRIMARY KEY,
  enviada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 11. script_state: onde cada conversa parou no script de atendimento
--     (Script_Bot_Atendimento.docx).
--
-- A chave é o NÚMERO, não o lead_id, pelo mesmo motivo de saudacoes_enviadas:
-- a conversa começa em "oi", antes de existir qualquer lead. Amarrar o estado
-- do fluxo ao lead faria o script não conseguir nem fazer a primeira pergunta.
--
-- `no_atual` nulo significa "conversa não começou ou já terminou" — nos dois
-- casos a próxima mensagem entra pelo N0.
-- ============================================================================
CREATE TABLE IF NOT EXISTS script_state (
  whatsapp_number TEXT PRIMARY KEY,
  no_atual TEXT,
  respostas JSONB NOT NULL DEFAULT '{}',
  fallbacks_consecutivos INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
