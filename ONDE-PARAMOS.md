# Onde paramos — 31/07/2026

Registro de estado para retomar sem reconstruir contexto. Atualizar ao fim de
cada sessão de trabalho.

## Estado dos 9 estágios

| # | Estágio | Status |
|---|---|---|
| 1 | Banco de dados | ✅ 8 tabelas, migrado em produção |
| 2 | Autenticação | ✅ contas individuais, sessão revogável (feito em 30/07) |
| 3 | Permissões | ❌ **não existe** — todo usuário tem os mesmos poderes |
| 4 | Pipeline de vendas | ✅ operável pelo painel |
| 5 | Histórico de atividades | ⚠️ notas por lead; `raw_messages`/`demand_signals` fora |
| 6 | API | ✅ escrita de leads e notas |
| 7 | Frontend | ✅ painel com ações, login/logout, gestão de mídias (31/07) |
| 8 | Workflows | ⚠️ funciona, mas só configurável mexendo em código |
| 9 | Agentes de IA | ✅ maduro |

## Pendências abertas — valem mais que os estágios restantes

Estas são o que separa "sistema pronto" de "sistema em uso". Nenhuma é código.

### 1. Criar o primeiro usuário em produção (rápido, alta prioridade)

Há **0 usuários** em produção, então a credencial compartilhada
(`casadaarvore`) ainda funciona e **não há rastreabilidade de quem age**. Ela se
autodesativa no momento em que o primeiro usuário for criado.

```bash
railway run --service Postgres sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npx tsx scripts/criar-usuario.ts'
```

O script desliga o eco do terminal — a senha não entra no histórico do shell.

### 2. `media_library` está vazia (0 itens) — ferramenta pronta em 31/07

O caminho pra popular **existe agora**: tela `/painel/midias` com upload,
prévia, ativar/desativar, remover e mapa de cobertura por unidade/etapa. Não
precisa mais de terminal nem de gerar URL na mão.

**Faltam duas coisas, nesta ordem:**

1. **Criar o volume no Railway** (uma vez, ~2 min) — instruções em
   `ENVIRONMENT.md`, seção "Volume de mídia". Sem isso o upload funciona mas os
   arquivos desaparecem no próximo deploy, e aí a biblioteca fica pior que
   vazia: registro apontando pra URL 404 faz o motor achar que tem mídia e o
   envio falhar na frente do cliente.
2. **Subir os arquivos** pela tela. Mínimo por unidade:

| Etapa | O que enviar | Formato |
|---|---|---|
| 1 | 1 foto icônica (externa) | JPG/PNG até 5MB |
| 2 | 1 vídeo de tour, 15–30s | **MP4** até 16MB |
| 3 | 3–4 fotos de eventos reais | JPG/PNG até 5MB |
| 4 | 1 catálogo | PDF |

Unidades: `casa_da_arvore`, `park_lagos`, `shopping_park_lagos`, `casarao`,
`casa_por_do_sol`. Dá pra começar só pelas que têm material — unidade sem mídia
não gera erro, só não avança a régua (loga aviso).

**Pegadinha de formato:** vídeo de iPhone é `.mov` e a Meta **não aceita** —
precisa converter pra `.mp4`. A tela recusa com essa explicação em vez de
deixar passar e falhar no envio.

**Nuance importante:** o handoff dispara em `pergunta_valor` ("quanto custa?"),
que é quase sempre a primeira pergunta do cliente. Ou seja, a maioria dos leads
vai pro vendedor **antes** da régua de mídia avançar — o que torna esta
pendência menos crítica do que parece. A etapa 1 é a que mais importa.

### 3. Templates da Meta — ✅ resolvido em 01/08/2026

Verificado pela Graph API: **os 8 templates estão `APPROVED`**, em `pt_BR`.
Os 4 que estavam "Em análise" em 30/07 (`handoff_vendedor`,
`aniversario_casamento`, `prospeccao_corporativa`, `ultima_campanha`) saíram.

Nada a fazer no código — o envio já usava template com fallback automático, e o
corpo aprovado do `handoff_vendedor` bate com `CORPO_TEMPLATE_HANDOFF`. Na
prática: a notificação do vendedor e as réguas agora **entregam fora da janela
de 24h**. O comando pra reconferir está em ENVIRONMENT.md.

Pendência menor: o TTL padrão de template de utilidade é **10 minutos**. Se o
celular do vendedor estiver offline nesse tempo, a notificação é descartada em
silêncio. Vale configurar validade maior na tela do `handoff_vendedor`.

### 0. 🔴 BLOQUEIO: conta da Meta sem meio de pagamento (01/08/2026)

**Nada que o sistema envie por iniciativa própria está sendo entregue.** Erro
`131042` ("Business eligibility payment issue") em toda mensagem de template:

```
status="failed" codigoMeta=131042
detalhe="your WhatsApp Business account currency is not configured"
```

Atinge: notificação de handoff do vendedor, follow-ups de 2h/48h/7d/30d,
réguas de ciclo de vida e prospecção corporativa. Tudo isso é template, e
template é conversa iniciada pela empresa — cobrada pela Meta.

**Não atinge** as respostas ao cliente dentro de 24h (conversa de serviço, não
cobrada): o script guiado inteiro entrega normalmente, confirmado com
`delivered` no log.

Como resolver (só quem tem acesso ao billing da conta consegue): definir
país/moeda e cadastrar meio de pagamento na conta `Tia Bia`, em
business.facebook.com → Billing Hub. Link direto no próprio erro:

```
https://business.facebook.com/billing_hub/accounts/details/?business_id=323341174915495&asset_id=1574728080666239&wizard_name=CHANGE_COUNTRY_CURRENCY&account_type=whatsapp-business-account
```

Nada a fazer no código depois — o próximo handoff entrega sozinho. Para
confirmar, procurar `status="delivered"` no log em vez de `failed`.

Por que demorou a aparecer: o envio devolvia HTTP 200 e o log dizia "vendedor
notificado". O 200 é só "aceitei para entregar"; o desfecho vem depois, por
webhook de status — que era descartado. Corrigido no commit `3c4ed8a`.

### 4. WhatsApp do vendedor não ativado

O número definitivo é `+5522997546818`, mas **o WhatsApp dele ainda não foi
ativado** — é a pendência real aqui. Não precisa de configuração nenhuma no
Meta: a conta está em modo `LIVE`, basta ter WhatsApp comum funcionando no
número.

Enquanto isso, `VENDEDOR_WHATSAPP_NUMBER` está apontando para o número de
**teste** `+5522974026786` (definido em 01/08/2026 no Railway e no `.env`
local), pra destravar os testes finais.

**Quando o 6818 estiver ativo:** trocar a variável de volta no Railway e no
`.env`, e atualizar ENVIRONMENT.md. É a única mudança necessária — não há nada
disso no código.

## Ambiente local

Funciona, mas depende de Docker de pé:

```bash
docker start casa_da_arvore_db casa_da_arvore_redis   # volumes com dados preservados
npm run dev                                            # ou preview_start "casa-da-arvore-api"
```

- Painel local: http://localhost:3000/painel — usuário `thiago@teste.local`,
  senha `teste-local-2026` (**só local**, criado para teste)
- Mídias: http://localhost:3000/painel/midias (arquivos vão pra
  `./midia-arquivos`, gitignored)
- `/` responde 404 de propósito: é uma API, a interface é `/painel`

**Atrito conhecido:** `npm run migrate` falha localmente porque
`scripts/migrate.js` não carrega o `dotenv` — só funciona onde as variáveis são
injetadas (Railway). Contorno:

```bash
export $(grep -E '^DATABASE_URL=' .env | xargs) && node scripts/migrate.js
```

Um `require("dotenv/config")` de uma linha resolveria; não foi feito por estar
fora do escopo pedido.

## Produção

- App: https://sparkling-forgiveness-production.up.railway.app
- Railway: projeto `astonishing-respect`, serviço `sparkling-forgiveness`
- Número do bot: **+55 22 99815-1869** ("Tia Bia"), `account_mode: LIVE`,
  qualidade GREEN, TIER_250

Deploy e migração:

```bash
railway up --service sparkling-forgiveness --detach
railway run --service Postgres sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/migrate.js'
```

## Decisões de arquitetura que não são óbvias no código

Registradas para não serem desfeitas por engano:

- **Sessão em Redis, não JWT** — precisa ser revogável (alguém sai da empresa, o
  acesso morre na hora), e o Redis já era dependência.
- **Conexão Redis separada da fila** (`config/redis.ts` vs `queue/connection.ts`)
  — o BullMQ usa comandos blocking e duplica conexão; compartilhar causa
  interferência difícil de diagnosticar.
- **`scrypt` em vez de bcrypt/argon2** — evita dependência com compilação
  nativa no build da imagem. Parâmetros gravados dentro do hash, então podem ser
  endurecidos sem invalidar senhas existentes.
- **`comErro` em toda rota async** — Express 4 não captura Promise rejeitada, e
  uma falha de banco derrubava o processo inteiro (com os workers da fila
  dentro). Isso aconteceu de verdade em 30/07. Não remover.
- **`atualizarLead` não toca `ultima_interacao`** — aquele campo mede contato do
  CLIENTE e é o que a régua de follow-up usa; escrever por ação interna
  cancelaria follow-ups por engano.
- **Autoria de nota vem da sessão, nunca do corpo** — há teste travando isso.
- **`location.origin` nas chamadas do painel** — URL relativa quebra quando a
  página é aberta como `http://user:pass@host/painel` (o `fetch` recusa URL com
  credenciais).
- **Fallback de template só em erro 132xxx** — outros erros (token, rede, janela
  de 24h) propagam, para não mascarar a causa real.
- **`/midia/:arquivo` é pública de propósito** — quem baixa o arquivo é o
  servidor da Meta, que só recebe a URL e não tem cookie nem Basic Auth. Rota
  autenticada ali significaria toda mídia falhando no envio. Só expõe material
  institucional; nenhum dado de lead passa por lá. O nome do arquivo é validado
  por lista de permissão (regex do código gerado), com teste de path traversal.
- **`ETAPAS_MIDIA` (mediaLibrary.repo.ts) é a única definição de etapa →
  tipo/categoria** — o motor de mídia e a tela de upload leem a mesma tabela. Se
  cada ponta tivesse sua cópia, mídia cadastrada numa etapa poderia nunca ser
  encontrada pela outra, e o sintoma (mídia cadastrada que não é enviada) é dos
  mais difíceis de diagnosticar.
- **Upload recebe o arquivo como corpo binário, não multipart** — evita a
  dependência de parser (multer) na imagem; o `fetch` do navegador manda um
  `File` como corpo com o Content-Type correto sem ginástica. Mesmo motivo do
  parser de cookie próprio em `auth.ts`.
- **Grava arquivo → grava registro; se o INSERT falha, apaga o arquivo** —
  arquivo órfão é inofensivo, registro órfão não: o motor trata como mídia
  disponível e o envio falha na frente do cliente. Há teste travando isso.
- **Limites de tamanho/formato validados no upload, não no envio** — um vídeo de
  20MB entraria na biblioteca sem erro e só falharia semanas depois, no meio de
  uma conversa real, com o log longe da causa.

## Escopo deliberadamente não implementado

Não são esquecimentos:

- **"3 mensagens de dúvida seguidas → handoff sugerido"** (Seção 5) — o
  documento não define o que conta como "mensagem de dúvida".
- **"Aniversário do cliente/criança" e "criança completando 14 anos"** (Seção 6)
  — exigem data de nascimento, e o schema só coleta idade no momento do evento.
- **Textos de follow-up e ciclo de vida são autorais** — a Seção 6 define os
  gatilhos, não a redação. Revisar o tom antes de confiar em produção.
