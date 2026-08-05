# Onde paramos — 05/08/2026

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
| 8 | Workflows | ✅ prazos, horário, SLA, vendedor por unidade e gatilhos editáveis em `/painel/configuracoes` (31/07, vendedor em 05/08) |
| 9 | Agentes de IA | ✅ maduro |

O único buraco de código restante é o **estágio 3**. O 5 é parcial por escolha.

## Script guiado ligado em produção (01/08)

`SCRIPT_FLUXO_ATIVO=true` no Railway desde 01/08, validado em conversa real.
Muda duas coisas no comportamento: o filtro de relevância é ignorado (toda
mensagem vira lead) e o handoff passa a ser decidido pelos nós do script, não
pela classificação da IA.

Junto com isso, em 01/08 foram fechados os três buracos do pós-aquisição
(Seção 6 / Parte 10 do Script), commit `e734e6b`:

- **Regressão corrigida:** com o script ativo, nenhum follow-up era agendado —
  `agendarFollowUp` só era chamado pelo caminho de mídia progressiva, que o
  script não usa. Quem abandonava a conversa no meio da qualificação nunca mais
  recebia nada.
- A régua de 2h agora repete a **pergunta pendente** em vez de falar do
  "material que te enviei" para quem nunca recebeu material.
- Implementados os dois gatilhos de ciclo de vida que faltavam: **aniversário
  da criança** (1 semana antes) e **criança completando 14 anos** (convite pro
  Casarão). Ambos dependem de `data_aniversario_crianca`; lead sem essa data
  não entra na régua.

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

**Ficaram faltando dois, criados em 01/08:** `aniversario_crianca` e
`convite_15_anos` **ainda não existem na Meta** — precisam ser submetidos como
Marketing. Corpo exato a submeter está em ENVIRONMENT.md, seção "Templates de
ciclo de vida ainda por submeter"; tem que bater **letra por letra** com as
constantes em `jobs/lifecycleFollowUp.cron.ts`, que são o fallback de texto
livre. Nada a mudar no código depois da aprovação — o envio troca sozinho.

Sem eles, essas duas réguas na prática não entregam: disparam meses ou anos
depois do contato, sempre fora da janela de 24h, onde só template passa.

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

### 4. Dois vendedores por unidade (05/08/2026) — ✅ resolvido

Superou a pendência antiga de vendedor único (`+5522997546818`, que nunca teve
o WhatsApp ativado e não é mais usado pelo handoff). O handoff agora tem
**dois vendedores reais**, com WhatsApp confirmado ativo, escolhidos pela
unidade recomendada (ver ENVIRONMENT.md, seção "Vendedor que recebe o
handoff"):

| Vendedor | Número | Unidades |
|---|---|---|
| Comercial | `+5522997249462` | Casarão, Casa Pôr do Sol |
| Festa infantil / recreação | `+5522974052903` | Casa da Árvore, Park Lagos, Shopping Park Lagos |

Configurável em `/painel/configuracoes`, sem deploy. Vale a pena confirmar em
conversa real assim que possível (mandar "quanto custa?" simulando cada ramo e
checar `status="delivered"` no log), mas não é mais bloqueio conhecido.

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
- **O runner agenda a régua a cada pergunta pendente, sem checar duplicata** —
  parece bug e não é: a régua se cancela sozinha comparando `ultima_interacao`
  com o momento do agendamento, então cada resposta nova invalida os jobs
  anteriores e sobra exatamente um vivo. Deduplicar na entrada exigiria estado
  extra para o mesmo resultado.
- **Retomada da pergunta pendente vai como texto livre, não template** — dentro
  da janela de 24h isso é conversa de serviço: entrega sem depender de
  aprovação e sem custo de conversa iniciada pela empresa (que hoje está
  bloqueada pelo billing). Por isso só vale na régua de 2h; nas demais a janela
  já fechou.
- **Templates de aniversário sem variável de nome** — template com variável
  exige aprovar o formato com exemplo, e o nome da criança nem sempre foi
  extraído. Felicitação que erra o nome é pior que felicitação sem nome.
- **Réguas de data comparam dia e mês separados, não montam a data do ano
  corrente** — montar `2027-02-29` estoura em ano não bissexto.
- **Tag de idempotência por ano no aniversário, única no convite de 15 anos** —
  o aniversário se repete todo ano; fazer 14 anos acontece uma vez.
- **Vendedor do handoff é config de banco por unidade, não env var** (05/08) —
  são dois vendedores reais, não um. Mesmo eixo que já decide o SLA
  (`UnidadeRecomendada`), então corporativo e 15 anos herdam o vendedor do
  Casarão de graça (roteamento já resolve os dois pra lá). `isNumeroDaEquipe()`
  virou async porque passou a ler a config em vez de comparar com uma env var
  síncrona.

## Escopo deliberadamente não implementado

Não são esquecimentos:

- **"3 mensagens de dúvida seguidas → handoff sugerido"** (Seção 5) — o
  documento não define o que conta como "mensagem de dúvida".
- **Textos de follow-up e ciclo de vida são autorais** — a Seção 6 define os
  gatilhos, não a redação. Revisar o tom antes de confiar em produção.

Saiu desta lista em 01/08: "aniversário da criança" e "criança completando 14
anos" estavam aqui como fora de escopo por suposta falta de data de nascimento
no schema. Era leitura errada — `data_aniversario_crianca` já existia no ramo
de recreação avulsa. Ambos implementados.
