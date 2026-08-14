# Onde paramos — 14/08/2026

Registro de estado para retomar sem reconstruir contexto. Atualizar ao fim de
cada sessão de trabalho.

## Aviso de ociosidade do vendedor + bot responde até 3 dúvidas (14/08)

Motivado por um caso real: lead (Matheus e Bia, casamento, Casa Pôr do Sol)
mandou "quanto custa?" no domingo 09/08, o handoff disparou certinho (template
aceito pela Meta, relay aberto), e o vendedor comercial (`+5522997249462`)
simplesmente não respondeu por 5 dias — sem nenhum alerta, porque o SLA por
unidade (15/20/30/10 min) é só texto informativo no e-mail, nunca foi
fiscalizado por código. Investigação completa disponível no histórico da
sessão; resumo do que foi implementado:

**Aviso de ociosidade (config nova, editável em `/painel/configuracoes`):**
Se ninguém (vendedor) responder o cliente dentro de um prazo configurável
(padrão **5 min**), o bot manda uma mensagem de espera — honesta, sem fingir
ser o vendedor: *"Só um instante 🙏 nosso consultor está ocupado no momento e
já te retorna. Se quiser já ir adiantando alguma dúvida, fico por aqui pra
ajudar!"*. O relógio começa na abertura do handoff e a cada mensagem nova do
cliente; cancela sozinho se o vendedor responder a tempo. Implementado com o
mesmo mecanismo (BullMQ + tabela) da régua de follow-up, mas é um sistema
**separado** dela — nova fila `vendor-idle-check`
(`src/queue/vendorIdleQueue.ts` + `vendorIdle.job.ts`), nova coluna
`relay_atendimentos.aviso_espera_enviado_em` (controla pra não avisar 2x na
mesma janela de silêncio, mesmo se o cliente mandar várias mensagens seguidas).

**Bot responde até 3 dúvidas, só depois do aviso já ter disparado:** depois
que o aviso de ociosidade sai, se o cliente perguntar algo, o bot tenta
responder — mas **só com dados que o próprio lead já informou** (nome, tipo de
evento, data, convidados, unidade, resumo do pedido). Preço, desconto, forma
de pagamento, endereço, disponibilidade de agenda, política ou contrato são
sempre "sensível": o bot nunca inventa esse tipo de fato (não existe fonte
confiável centralizada no código pra isso hoje), só desvia com *"Essa parte
específica meu consultor confirma certinho com você..."* — e isso **não**
gasta uma das 3 tentativas, só pergunta respondida de verdade conta. Na 3ª
resposta, o bot se despede ("vou aguardar meu consultor...") e para de
responder sozinho até o vendedor aparecer. Classificação segura/sensível via
nova função `responderDuvidaEmEspera` em `anthropic.service.ts` (Claude,
prompt à parte do de extração); contador `perguntas_bot_respondidas` em
`relay_atendimentos`, zera junto com o aviso quando o vendedor responde de
verdade (mesmo evento, mesma janela).

Mensagem de forwarding pro vendedor continua acontecendo em paralelo, sempre
— o bot é só um paliativo pro cliente não ficar no vácuo, o vendedor vê tudo
quando aparecer.

**Fora do escopo por decisão consciente:** não existe hoje um lugar
centralizado com fatos institucionais verificados (endereço, políticas, forma
de pagamento) que a IA pudesse usar com segurança — por isso o "seguro" ficou
restrito aos dados do próprio pedido do lead. Se quiser abrir mais o escopo
depois, o caminho natural é um campo configurável no painel (mesmo padrão do
SLA/vendedor) que o admin preenche com texto real, não a IA inferindo.

Arquivos principais: `relay.service.ts` (`agendarChecagemOciosidade`,
`processarOciosidadeVendedor`, `tentarResponderDuvidaEmEspera`),
`relay.repo.ts` (`buscarAtendimento`, `vendedorRespondeuDesde`,
`marcarAvisoEsperaEnviado`, `resetarAvisoEspera`,
`incrementarPerguntaBotRespondida`), `leads.repo.ts`
(`buscarContextoLead`), `anthropic.service.ts` (`responderDuvidaEmEspera`),
`configuracoes.repo.ts` / `configApi.schemas.ts` / `configPainel.service.ts`
(campo `avisoOciosidadeVendedorMinutos`). 274 testes verdes, sem teste
dedicado pro fluxo novo (mesmo padrão de `followUp.service.ts`, que também não
tem — a régua de follow-up nunca teve testes de integração com fila/banco).

**Deploy:** migração (aditiva, só `ADD COLUMN IF NOT EXISTS`) e `railway up`
já rodados em produção nesta data — worker novo confirmado no log
("worker de aviso de ociosidade do vendedor iniciado"), `/health` ok.
Código ainda **não commitado** no momento deste registro (só rodou em
produção via `railway up`, que sobe o diretório direto — não depende de git).

## Gestão de leads no painel (08/08, tarde)

Pra permitir testes de ponta a ponta repetíveis e correção de dados:

- **Apagar lead (só admin)** — botão "🗑 Apagar" no card, com confirmação
  dupla. `DELETE /api/leads/:id` (rota exige `exigirAdmin`) apaga o lead e
  TODO o histórico numa transação: FKs em cascata (conversation_state, notas,
  demand_signals, relay_*) + DELETE explícito nas tabelas chaveadas por número
  (raw_messages, saudacoes_enviadas, script_state, mensagens_enviadas).
  Apagado, o número volta a ser tratado como cliente NOVO — é o reset de teste.
- **Editar nome e telefone** — lápis ✏️ ao lado do contato no card abre o
  formulário. Telefone aceita qualquer formato e é normalizado pra
  dígitos-only (mesmo formato do webhook); número já usado por outro lead
  responde 409 legível. `PATCH /api/leads/:id` ganhou `nome_cliente` e
  `whatsapp_number`.
- Celular dos vendedores pro handover: JÁ era editável em
  `/painel/configuracoes` → "Vendedor que recebe o handoff" (por unidade +
  padrão). Nada mudou aí.

Arquivos: `leads.repo.ts` (apagarLead, atualizarLead), `leadsApi.ts`,
`leadsApi.schemas.ts` (+testes), `painel.service.ts`. 274 testes verdes.

## Handover dentro da conversa do bot (08/08) — DOIS caminhos

Depois do handoff, o vendedor não precisa mais chamar o cliente do próprio
número. Dois caminhos, ambos saindo pelo número da Tia Bia (pro cliente é uma
conversa só):

1. **Relay pelo WhatsApp do vendedor** — ele escreve pro número do bot e o bot
   repassa; mensagem nova do cliente é encaminhada pro WhatsApp dele.
2. **Chat no painel** — botão "💬 Conversa" em cada card de lead abre
   `/painel/leads/:id/conversa`: histórico completo bot↔cliente (com autor:
   Tia Bia/vendedor/painel) e caixa de resposta. Polling de 5s, Enter envia.
   Enviar do painel marca o lead como atendimento humano na hora; "Devolver ao
   bot" desfaz. Atendente só abre lead da unidade dele (mesma regra do
   estágio 3, checada também na URL direta). Erro de janela de 24h fechada
   volta como mensagem legível pro atendente — ele SABE que não entregou.

Pro histórico existir, TODO envio da empresa passou a ser gravado em
`mensagens_enviadas` (texto, template como `[template nome]`, mídia como
`[foto enviada]...`), com `origem` bot/vendedor/painel — gravação não-fatal,
depois do aceite da Meta. Entrada do cliente já ficava em `raw_messages`.

Comandos do vendedor (mensagem inteira começando com `#`):

| Comando | Efeito |
|---|---|
| texto normal | vai pro cliente selecionado (✱) |
| `#leads` / `#lista` | lista os atendimentos abertos dele |
| `#1`, `#2`... | troca o cliente selecionado |
| `#fim` | encerra o atendimento (lead segue em atendimento humano) |
| `#bot` | encerra E devolve a conversa pro fluxo do bot |
| `#ajuda` | lista os comandos. Comando com typo (`#fin`) cai aqui, nunca vaza pro cliente |

Peças novas: tabelas `relay_atendimentos`, `relay_mensagens` e
`mensagens_enviadas`; `repositories/relay.repo.ts` e `conversa.repo.ts`;
`services/relay.service.ts` e `conversaPainel.service.ts`; rotas
GET/POST `/api/leads/:id/conversa` e GET `/painel/leads/:id/conversa`.
Integração: `notificarHandoff` abre o atendimento de relay (cobre IA e script
guiado); o worker desvia mensagem de número da equipe pro relay e encaminha
mensagem de cliente já em atendimento; "devolver ao bot" no painel fecha os
atendimentos de relay do lead (senão vendedor e bot responderiam juntos).

Decisões que valem registro:

- **Um atendimento "selecionado" por vendedor, por construção** (índice parcial
  único). Handoff novo NÃO rouba o foco de quem já está selecionado — trocar de
  cliente no meio de uma frase mandaria resposta pra pessoa errada, o pior erro
  possível da ponte. Com zero ou um atendimento, tudo funciona sem comando.
- **Encaminhamento cliente→vendedor é texto livre** — só entrega se o vendedor
  falou com o bot nas últimas 24h (janela da Meta). Na prática o uso do relay
  mantém a janela aberta sozinho; se fechar, o e-mail de aviso (que já existia)
  segue como canal confiável e a falha fica em `relay_mensagens.erro`.
- **Só texto na v1** — o webhook já descartava tipo ≠ text; mídia do vendedor
  pro cliente fica pra depois (dá pra reenviar por media id da própria Meta).
- **Falha ao abrir o relay não derruba o handoff** — e-mail e template já
  saíram; o log registra.

Pra migrar: `railway run --service Postgres sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/migrate.js'`
(schema.sql é idempotente, as tabelas novas entram sozinhas). Teste real:
disparar handoff ("quanto custa?"), responder pelo WhatsApp do vendedor e
conferir `status="delivered"` + linhas em `relay_mensagens`.

## Estado dos 9 estágios

| # | Estágio | Status |
|---|---|---|
| 1 | Banco de dados | ✅ 8 tabelas, migrado em produção |
| 2 | Autenticação | ✅ contas individuais, sessão revogável (feito em 30/07) |
| 3 | Permissões | ✅ dois papéis (admin/atendente), `/painel/usuarios` — em produção (05/08) |
| 4 | Pipeline de vendas | ✅ operável pelo painel |
| 5 | Histórico de atividades | ⚠️ notas por lead; `raw_messages`/`demand_signals` fora |
| 6 | API | ✅ escrita de leads e notas |
| 7 | Frontend | ✅ painel com ações, login/logout, gestão de mídias (31/07) |
| 8 | Workflows | ✅ prazos, horário, SLA, vendedor por unidade e gatilhos editáveis em `/painel/configuracoes` (31/07, vendedor em 05/08) |
| 9 | Agentes de IA | ✅ maduro |

Não sobra buraco de código nos 9 estágios — o 5 é parcial por escolha, não por
faltar implementar.

## Permissões implementadas e em produção (05/08)

Dois papéis: **admin** (acesso total — configurações, mídia, gestão de
usuários, todos os leads) e **atendente** (só trabalha leads, e só os da
unidade dele). Decisões que valem registro:

- **Unidade decide visibilidade, não um vínculo por vendedor** — mesmo eixo
  que já resolve SLA e vendedor do handoff (`UnidadeRecomendada`). Atendente
  vinculado a `casarao`/`casa_por_do_sol`, por exemplo, só vê leads dessas
  duas unidades.
- **Lead sem unidade decidida ainda é visível a TODO atendente** — de
  propósito. Escondê-lo de todo mundo até a qualificação chegar lá deixaria
  o lead sem ninguém trabalhando nele.
- **Sessão não guarda papel nem unidades** — `identificar()` busca do banco a
  cada requisição (já buscava o usuário; papel/unidades vieram de graça).
  Efeito prático: mudar o papel ou a unidade de alguém vale na próxima
  requisição dele, sem precisar deslogar.
- **Trava do último admin** — `PATCH /api/usuarios/:id` recusa rebaixar ou
  desativar o único admin ativo restante. Sem isso seria possível o próprio
  admin tirar o acesso de todo mundo a configurações/mídia/usuários,
  incluindo o dele.
- **`/painel/usuarios` substitui `npm run criar-usuario` como caminho
  principal** — o script de terminal continua existindo só como bootstrap de
  emergência (sempre cria admin, sem perguntar papel).
- **`taragutti@gmail.com` virou admin automaticamente** — a coluna `papel`
  nasceu com `DEFAULT 'admin'`, então quem já tinha conta antes deste estágio
  não perdeu acesso a nada.
- **Editar (nome/e-mail) e excluir usuário** (05/08, mesmo dia) — faltavam na
  primeira versão da tela; um e-mail digitado errado só dava pra corrigir
  criando conta nova. `DELETE` é exclusão de verdade, não desativação, mas
  tem três travas: não deixa excluir a própria conta, não deixa ficar sem
  nenhum admin ativo, e recusa (com mensagem clara, 409) usuário que já tem
  nota registrada em algum lead — a constraint em
  `lead_notes.autor_usuario_id` barra isso sozinha, a rota só traduz o erro.

**Em produção, 05/08:** 4 contas reais além do bootstrap — 2 admins (Thiago,
Tia Bia) e 2 atendentes (Tamara → Casarão/Casa Pôr do Sol; Cris → Casa da
Árvore/Park Lagos/Shopping Park Lagos), batendo com o agrupamento dos dois
vendedores do handoff. Uma conta duplicada da Cris (e-mail com erro de
digitação) foi criada e removida no mesmo dia.

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

### 1. Primeiro usuário em produção — ✅ já existia, verificado em 05/08/2026

O registro dizia "0 usuários" — estava errado. `taragutti@gmail.com` (Thiago)
existe desde 31/07/2026, então a credencial compartilhada `casadaarvore` já
está desativada sozinha (a lógica desativa no instante em que o primeiro
usuário é criado). Com o estágio 3 em produção, essa conta é `admin`.

Contas novas (atendente ou outro admin) agora se criam por **`/painel/usuarios`**,
logado — não precisa mais do script de terminal pra isso. `npm run criar-usuario`
continua existindo só como bootstrap de emergência.

### 2. `media_library` e volume de mídia — ✅ já resolvidos, verificado em 05/08/2026

O registro dizia "0 itens" e "volume não criado" — os dois estavam errados.
Verificado ao vivo: volume `sparkling-forgiveness-volume` montado em `/dados`
(57 MB/500 MB usados), e **25 itens ativos** já cadastrados. Cobertura real
por unidade (etapa 1 = foto externa, 2 = vídeo de tour, 3 = fotos de evento,
4 = catálogo PDF):

| Unidade | Etapa 1 | Etapa 2 | Etapa 3 | Etapa 4 |
|---|---|---|---|---|
| Casa da Árvore | ✅ | ❌ | ❌ | ❌ |
| Shopping Park Lagos | ✅ | ❌ | ❌ | ❌ |
| Casarão | ✅ | ❌ | ✅ (10) | ❌ |
| Casa Pôr do Sol | ✅ | ✅ | ✅ (10) | ❌ |
| Park Lagos | — fora do mapa por decisão sua em 31/07 (commit `d8e155d`): "material não vai ser cadastrado pra ela agora". Continua recebendo leads normalmente. |

**O que falta de verdade**, por `/painel/midias` (JPG/PNG até 5MB pra foto,
**MP4** até 16MB pro vídeo — `.mov` de iPhone é recusado, PDF pro catálogo):

- **Casa Pôr do Sol**: só o catálogo (etapa 4) — a mais perto de completa.
- **Casarão**: vídeo de tour (etapa 2) e catálogo (etapa 4).
- **Casa da Árvore** e **Shopping Park Lagos**: vídeo, fotos de evento e
  catálogo (etapas 2, 3 e 4) — só têm a foto externa.

**Nuance importante:** o handoff dispara em `pergunta_valor` ("quanto custa?"),
que é quase sempre a primeira pergunta do cliente. A maioria dos leads vai pro
vendedor **antes** da régua de mídia avançar — o que torna esta pendência
menos crítica do que parece.

### 3. Templates da Meta — ✅ resolvido em 01/08/2026

Verificado pela Graph API: **os 8 templates estão `APPROVED`**, em `pt_BR`.
Os 4 que estavam "Em análise" em 30/07 (`handoff_vendedor`,
`aniversario_casamento`, `prospeccao_corporativa`, `ultima_campanha`) saíram.

Nada a fazer no código — o envio já usava template com fallback automático, e o
corpo aprovado do `handoff_vendedor` bate com `CORPO_TEMPLATE_HANDOFF`. Na
prática: a notificação do vendedor e as réguas agora **entregam fora da janela
de 24h**. O comando pra reconferir está em ENVIRONMENT.md.

~~Pendência menor: TTL de 10 min~~ — **não existia, corrigido em 05/08/2026.**
10 minutos é o padrão de Autenticação, não de Utilidade; `handoff_vendedor` é
Utilidade e o padrão real é 30 dias (confirmado ao vivo pela Graph API, sem
`message_send_ttl_seconds` customizado). Não há descarte silencioso a
temer — ver ENVIRONMENT.md, seção "Validade da mensagem (TTL)".

**Os dois que faltavam foram submetidos em 05/08/2026:** `aniversario_crianca`
(id `27671533369135699`) e `convite_15_anos` (id `1376744327928347`), categoria
Marketing, corpo idêntico às constantes em `jobs/lifecycleFollowUp.cron.ts`.
Status atual: `PENDING` — revisão da Meta costuma sair em algumas horas a um
dia. Nada a fazer no código quando aprovar, o envio troca sozinho de texto
livre pra template. Comando pra reconferir status em ENVIRONMENT.md.

Até a aprovação sair, essas duas réguas na prática não entregam: disparam
meses ou anos depois do contato, sempre fora da janela de 24h, onde só
template passa.

### 0. ✅ Billing da Meta — resolvido em 05/08/2026 (tarde)

Bloqueava desde 01/08 (erro `131042`, meio de pagamento/moeda da conta).
Confirmado ao vivo com dois envios de teste reais nesta data:

- `+5522997249462` (comercial): falhou, mas com erro **diferente** —
  `131049` "manter engajamento saudável do ecossistema" (throttle da Meta por
  mandar o mesmo template duas vezes no mesmo dia sem resposta no meio, nada
  a ver com billing).
- `+5522974052903` (infantil/recreação): **`status="delivered"`** — entrega
  completa confirmada pelo webhook.

Nada a fazer no código — os próximos handoffs, follow-ups e réguas de ciclo
de vida entregam sozinhos. Deixou de ser bloqueio.

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
- **Permissões: papel decide o que você FAZ, unidade decide o que você VÊ**
  (05/08) — dois eixos independentes, não um só. Admin não é filtrado por
  unidade mesmo que tenha alguma vinculada (não deveria ter, a rota zera).
  Detalhes completos na seção "Permissões implementadas e em produção".

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
