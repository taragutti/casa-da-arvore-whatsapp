# Ambientes e Credenciais — Casa da Árvore

Este arquivo é o registro de **onde cada credencial está configurada de
verdade** e o **status** dela. Ele fica versionado no repositório de
propósito — o que muda de lugar são os valores (nunca entram aqui), não o
controle.

**Regra de ouro:** este arquivo nunca contém valores reais de token, chave
ou segredo — só nomes, status e onde encontrar o valor. Os valores em si
vivem em dois lugares possíveis:

- **Local (desenvolvimento):** `.env` na raiz do projeto (gitignored,
  específico desta máquina — ver `.env.example` para a lista de campos).
- **Produção:** variáveis de ambiente do projeto no Railway
  (`railway.app` → projeto `casa-da-arvore` → aba **Variables**).

## Checklist de variáveis

| Variável | Onde está configurada de verdade | Status | Observação |
|---|---|---|---|
| `DATABASE_URL` | Railway (gerada automaticamente ao criar o Postgres) | ✅ ok | — |
| `REDIS_URL` | Railway (gerada automaticamente ao criar o Redis) | ✅ ok | — |
| `INGEST_API_KEY` | Railway + valor equivalente na automação Make | ✅ ok | precisa ser idêntica nos dois lados |
| `ANTHROPIC_API_KEY` | Railway | ✅ ok | — |
| `ANTHROPIC_MODEL` | Railway | ✅ ok | tem default no código se ausente |
| `RESEND_API_KEY` | Railway | ⚠️ a confirmar | vazio no `.env` local em 25/07/2026 |
| `BRIEFING_RECIPIENT_EMAIL` | Railway | ✅ ok | financeiro@casadaarvoreadventure.com.br |
| `HANDOFF_NOTIFICATION_EMAIL` | não configurada ainda | ⚠️ pendente | opcional — cai pra `BRIEFING_RECIPIENT_EMAIL` se ausente; definir quando houver e-mail de consultor/gerente dedicado (Seção 5) |
| `WHATSAPP_VERIFY_TOKEN` | Railway + painel Meta for Developers (webhook) | ✅ ok | precisa ser idêntico nos dois lados |
| `WHATSAPP_APP_SECRET` | Railway (?) — **confirmar local exato** | ✅ funcionando (testado 25/07/2026, round-trip real) | vazio no `.env` local — token está configurado em outro ambiente |
| `WHATSAPP_ACCESS_TOKEN` | Railway (?) — **confirmar local exato** | ✅ funcionando — token **definitivo** (não expira em 24h) | vazio no `.env` local — mesma observação acima |
| `WHATSAPP_PHONE_NUMBER_ID` | Railway (?) — **confirmar local exato** | ✅ funcionando | vazio no `.env` local — mesma observação acima |
| `PAINEL_USERNAME` / `PAINEL_PASSWORD` | Railway | ✅ ok | definidas em 25/07/2026; painel acessível em `/painel` com HTTP Basic Auth |
| `VENDEDOR_WHATSAPP_NUMBER` | Railway | ⚠️ **valor temporário de teste** | `+5522974026786` (definido em 01/08/2026). O número definitivo é `+5522997546818`, mas **o WhatsApp dele ainda não foi ativado** — por isso os testes finais rodam no de teste. **Reverter para `+5522997546818` quando o WhatsApp do vendedor estiver de pé.** Vale pros dois lados: é pra onde o handoff notifica e é o único número que `isNumeroDaEquipe()` não trata como lead |
| `VENDEDOR_HANDOFF_TEMPLATE_NAME` | Railway | ✅ configurada | `handoff_vendedor` (definida 30/07/2026). Enquanto o template não for aprovado, o código cai pra texto livre automaticamente |
| `MEDIA_STORAGE_DIR` | Railway | ⚠️ **pendente** | precisa apontar para o ponto de montagem do volume (ex.: `/dados/midia`). Ver "Volume de mídia" abaixo — sem isso os arquivos somem a cada deploy |
| `SCRIPT_FLUXO_ATIVO` | Railway | ⚠️ **desligada** (`false`) | liga o script guiado (menus numerados, escada de qualificação). Antes de ligar: rodar `railway run node scripts/migrate.js` para criar a tabela `script_state`. Com ela ligada, o filtro de relevância é ignorado e o handoff passa a ser decidido pelo script, não pela IA |
| `PUBLIC_BASE_URL` | não configurada | ✅ opcional | se ausente, usa `RAILWAY_PUBLIC_DOMAIN` (injetada pela plataforma). Só definir se o app passar a atender por domínio próprio |

## Volume de mídia (biblioteca de mídia, Seção 4)

O painel em `/painel/midias` grava os arquivos de foto, vídeo e catálogo **em
disco**, e a rota pública `/midia/:arquivo` os serve — é por ela que os
servidores da Meta baixam o binário para entregar ao cliente no WhatsApp.

**O disco do container do Railway é efêmero.** Sem um volume, todo arquivo
enviado desaparece no próximo deploy e a `media_library` fica cheia de URLs
que retornam 404. Esse é o pior estado possível: o motor de mídia trata o
registro como mídia disponível, manda a URL pra Meta e o envio falha na frente
do cliente — diferente da biblioteca vazia, que apenas não avança a régua.

Como configurar (uma vez):

1. Railway → serviço `sparkling-forgiveness` → aba **Settings** → **Volumes** →
   **Add Volume**, com ponto de montagem `/dados`.
2. Na aba **Variables**, definir `MEDIA_STORAGE_DIR=/dados/midia`.
3. Redeploy. No boot o log mostra `diretório de mídia pronto` com o caminho
   resolvido — se aparecer erro ali, o volume não está montado.

Como confirmar que está de pé: subir uma foto em `/painel/midias`, abrir a URL
do arquivo em aba anônima (precisa carregar **sem** pedir senha — se pedir, a
Meta também não conseguiria baixar) e fazer um redeploy: a foto tem que
continuar aparecendo depois.

Local, nada a fazer: o default é `./midia-arquivos` na raiz do projeto.

## Templates de mensagem da Meta

Toda mensagem que o sistema envia **por iniciativa própria** (notificação do
vendedor no handoff, follow-ups, réguas de ciclo de vida) só é entregue fora da
janela de 24h se usar um **template aprovado** pela Meta. Texto livre nessas
situações é rejeitado.

O código tenta template primeiro e cai pra texto livre apenas quando a Meta
recusa por problema do próprio template (erros 132xxx) — então **nada precisa
ser alterado no código quando um template for aprovado**, é automático. Os
nomes abaixo já estão mapeados.

Status em **01/08/2026** (conferido pela Graph API, WABA `Tia Bia`
`1574728080666239` — todos `APPROVED`, todos `pt_BR`):

| Template | Categoria | Status | Usado por |
|---|---|---|---|
| `followup_2h` | Marketing | ✅ Aprovado | régua de silêncio, 2h |
| `followup_48h` | Marketing | ✅ Aprovado | régua de silêncio, 48h |
| `followup_7d` | Marketing | ✅ Aprovado | régua de silêncio, 7 dias |
| `followup_30d` | Marketing | ✅ Aprovado | nutrição, 30 dias |
| `handoff_vendedor` | Utilidade | ✅ Aprovado (01/08/2026) | notificação do vendedor no handoff |
| `aniversario_casamento` | Marketing | ✅ Aprovado (01/08/2026) | ciclo de vida, 1º ano de casamento |
| `prospeccao_corporativa` | Marketing | ✅ Aprovado (01/08/2026) | ciclo de vida, 1 ano após evento corporativo |
| `ultima_campanha` | Marketing | ✅ Aprovado (01/08/2026) | última campanha antes de arquivar lead frio |

Corpo aprovado do `handoff_vendedor` confere com `CORPO_TEMPLATE_HANDOFF`
(10 variáveis, mesma ordem) — nenhum ajuste de código necessário.

Como reconferir sem abrir o navegador (leitura pura, token vem do Railway):

```
railway run --service sparkling-forgiveness -- node -e '
  const u=new URL("https://graph.facebook.com/v21.0/1574728080666239/message_templates");
  u.searchParams.set("fields","name,status,category,language");
  u.searchParams.set("access_token",process.env.WHATSAPP_ACCESS_TOKEN);
  fetch(u).then(r=>r.json()).then(d=>console.table(d.data));'
```

Onde conferir/alterar: **business.facebook.com → Gerenciador do WhatsApp →
Modelos de mensagem → Gerenciar modelos** (cuidado com o filtro de data, que
esconde modelos antigos por padrão).

Regras da Meta que já custaram uma rejeição aqui, registradas pra não repetir:
- Template não pode **começar nem terminar** com variável (por isso `{{10}}`
  está entre aspas em `CORPO_TEMPLATE_HANDOFF`).
- Variável não aceita quebra de linha, tab, 4+ espaços seguidos, nem valor vazio.
- Corpo montado (texto fixo + valores) não pode passar de **1024 caracteres**.
- Categoria errada é a causa mais comum de rejeição: notificação operacional
  interna é **Utilidade**; reengajamento/promoção é **Marketing**.

Os testes em `whatsapp.service.test.ts` cobrem essas regras — se alguém mudar
o corpo do template e esquecer de resubmeter na Meta, um teste falha.

### Validade da mensagem (TTL)

Templates de utilidade têm validade padrão de **10 minutos** na Meta: se o
WhatsApp não conseguir entregar nesse prazo (celular desligado, sem sinal), a
mensagem é descartada silenciosamente. Como o SLA de handoff é de 15 a 30
minutos, vale configurar um período de validade maior na tela do template —
notificação de lead atrasada ainda serve, perdida não.

## Pendência aberta

As três variáveis do WhatsApp funcionam em produção (testado ao vivo em
25/07/2026 — mensagem real recebida e respondida pelo bot em segundos), mas
ainda não está confirmado **neste documento** se elas estão no Railway ou em
outro `.env` fora deste checkout. Próxima vez que alguém mexer nisso: abrir
o Railway → Variables e confirmar contra esta tabela, atualizando a coluna
"Onde está configurada" com o local exato.

## Como manter isso útil

- Sempre que gerar, rotacionar ou mover uma credencial, atualizar a linha
  correspondente aqui (status + onde está) — nunca o valor.
- Se uma variável for temporária (como o token de teste do WhatsApp antes
  de virar definitivo, que expira em 24h), marcar isso na coluna
  "Observação" para não repetir a investigação que gerou esta tabela.
- Antes de concluir que algo "não está configurado", checar o Railway, não
  só o `.env` local — os dois podem divergir e ambos são válidos para seus
  respectivos ambientes.

## Templates de ciclo de vida ainda por submeter

Duas réguas pós-aquisição foram implementadas em 01/08/2026 e disparam por
data, meses ou anos depois do contato — ou seja, sempre fora da janela de 24h,
onde só template é entregue. Os dois templates ainda **não existem na Meta**:

| Template | Categoria sugerida | Corpo a submeter |
|---|---|---|
| `aniversario_crianca` | Marketing | "Oi! Chegou a semana de aniversário aí na sua casa 🎉 Se quiser comemorar com a gente, temos datas disponíveis e condições especiais para quem já nos conhece. Quer que eu veja as opções para você?" |
| `convite_15_anos` | Marketing | "Oi! Lembramos que está chegando a idade da festa de 15 anos 🎉 Nosso Casarão é referência em debutantes em Cabo Frio — se vocês já estiverem começando a planejar, é só responder que eu mando as fotos e as datas disponíveis. 🌳" |

O corpo precisa ficar **idêntico** ao das constantes em
`jobs/lifecycleFollowUp.cron.ts`, que são o fallback de texto livre. Nada a
mudar no código depois da aprovação — o envio troca sozinho.

Ambas dependem de `data_aniversario_crianca`, coletada no ramo de recreação
avulsa. Lead sem essa data não entra na régua.
