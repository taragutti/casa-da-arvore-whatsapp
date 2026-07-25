# Casa da Árvore — Automação Comercial e Inteligência de Demanda

Versão sem integração direta com o WhatsApp Business Cloud API: os dados chegam
via um **endpoint de ingestão genérico**, que a automação já existente (Make /
ecossistema WhatsApp atual) deve chamar a cada mensagem relevante.

## Setup local

1. Copie o arquivo de variáveis de ambiente:
   ```bash
   cp .env.example .env
   ```
   Preencha pelo menos `INGEST_API_KEY` (invente uma chave forte) e, quando for
   testar a extração de verdade, `ANTHROPIC_API_KEY`.

2. Suba o Postgres e o Redis locais:
   ```bash
   docker compose up -d
   ```
   O `schema.sql` é aplicado automaticamente na primeira subida (via
   `docker-entrypoint-initdb.d`). Se precisar reaplicar depois de editar o
   schema, recrie o volume: `docker compose down -v && docker compose up -d`.
   O Redis é usado pela fila assíncrona (Etapa 5) — sem ele o servidor não sobe.

3. Instale as dependências e suba o servidor:
   ```bash
   npm install
   npm run dev
   ```

4. Confirme que subiu certo:
   ```bash
   curl http://localhost:3000/health
   # {"status":"ok","db":"conectado"}
   ```

## Testando o endpoint de ingestão

```bash
curl -X POST http://localhost:3000/api/leads/ingest \
  -H "Content-Type: application/json" \
  -H "x-api-key: <o mesmo valor de INGEST_API_KEY do .env>" \
  -d '{
    "whatsapp_number": "+5521999999999",
    "mensagem": "Oi, gostaria de saber o orçamento para uma festa de aniversário infantil em setembro, umas 30 pessoas"
  }'
```

A resposta agora é `202 {"status":"enfileirado","job_id":"..."}` — desde a
Etapa 5, o endpoint só valida e enfileira; a extração via IA e a gravação no
banco acontecem no worker, em segundo plano. Pra ver o resultado, espere um ou
dois segundos e confira a tabela `leads` (veja o comando de `docker exec` mais
abaixo) ou olhe o log do `npm run dev` — o worker imprime `[fila] job ... concluído`.

Se `ANTHROPIC_API_KEY` não estiver configurada, a extração vai falhar com erro
claro dentro do worker (isso é esperado até você colocar uma chave válida).

## Teste de carga (Etapa 5)

Critério de aceite da Etapa 5: 10 mensagens simultâneas, todas processadas sem
perda. Pra simular isso, rode este bloco (manda as 10 mensagens em paralelo,
uma logo atrás da outra):

```bash
for i in $(seq 1 10); do
  curl -s -X POST http://localhost:3000/api/leads/ingest \
    -H "Content-Type: application/json" \
    -H "x-api-key: <o mesmo valor de INGEST_API_KEY do .env>" \
    -d "{\"whatsapp_number\": \"+55219999900$i\", \"mensagem\": \"Quero orçamento pra festa de aniversário, mensagem número $i\"}" \
    -o /dev/null -w "requisição $i: %{http_code}\n" &
done
wait
```

Todas devem responder `202` quase instantaneamente. Depois, confira quantos
leads foram criados:

```bash
docker exec -it casa_da_arvore_db psql -U postgres -d casa_da_arvore -c "SELECT count(*) FROM leads;"
```

## Briefing mensal (Etapa 7)

Todo dia 1 às 07:00 (horário de Brasília), o servidor gera automaticamente um
briefing de conteúdo/tráfego pago a partir dos sinais de demanda do mês
anterior, salva em `monthly_briefings` e manda por e-mail (via Resend).

Pra rodar manualmente, sem esperar o cron (útil pra testar):

```bash
npm run briefing               # processa o mês anterior ao atual
npm run briefing -- 2026-07    # processa um mês específico (formato AAAA-MM)
```

Se não houver nenhum sinal de demanda no período, o job avisa no log e não
gera nada (não vale a pena gastar uma chamada de IA à toa). Se `RESEND_API_KEY`
ou `BRIEFING_RECIPIENT_EMAIL` não estiverem configurados, o briefing é gerado e
salvo no banco normalmente, só o envio por e-mail é pulado (com aviso no log).

Pra configurar o envio de verdade:
1. Crie uma conta grátis em **resend.com**
2. Em **API Keys**, gere uma chave e coloque em `RESEND_API_KEY`
3. Enquanto não verificar um domínio próprio em Resend, os e-mails saem do
   remetente de teste `onboarding@resend.dev` (funciona, só não personalizado)

## Rodando os testes

```bash
npm test
```

7 testes cobrem o serviço de extração (`anthropic.service.ts`) com mensagens
variadas, incluindo uma sem nenhum dado extraível e uma resposta malformada da
IA — nenhum deles chama a API de verdade (o cliente Anthropic é mockado), então
não gastam crédito nem precisam de internet.

## Logs (Etapa 8)

O servidor usa logs estruturados (pino): em desenvolvimento saem coloridos e
legíveis no terminal; em produção (`NODE_ENV=production`) saem em JSON, uma
linha por evento — fácil de filtrar em qualquer plataforma de hospedagem.

Toda mensagem que chega ganha um `rawMessageId` que aparece em cada linha de
log relacionada a ela, do recebimento até o resultado final. Dá pra seguir o
caminho completo de uma mensagem específica assim:

```bash
# copie o rawMessageId de qualquer linha do log e filtre por ele
npm run dev 2>&1 | grep <rawMessageId>
```

## O que já está pronto (Etapas 1 a 5, 7 e 8 do plano)

- Estrutura do projeto (Node.js 20+, TypeScript, Express)
- Schema do banco: `leads`, `demand_signals`, `monthly_briefings`, `raw_messages`
- Docker Compose para Postgres e Redis locais
- `POST /api/leads/ingest` — endpoint genérico protegido por API key: valida e
  enfileira (não processa mais na própria requisição)
- `GET/POST /webhooks/whatsapp` — webhook do número de TESTE do WhatsApp Cloud
  API (Meta), com validação de assinatura; também só enfileira
- Fila assíncrona (BullMQ/Redis, `src/queue/`) — o worker (`processMessage.job.ts`)
  é quem de fato:
  - filtra relevância por palavras-chave
  - grava em `raw_messages` para auditoria/reprocessamento
  - extrai via IA com validação de enum e retry (`anthropic.service.ts`)
  - faz upsert em `leads` + registra `demand_signals`
  - manda a confirmação automática de volta (só no caminho do WhatsApp de teste)
- `GET /health` — checagem de disponibilidade, banco e Redis
- Testes unitários do serviço de extração (`npm test`)
- Job mensal de briefing (`src/jobs/monthlyBriefing.cron.ts`): agrega
  `demand_signals` por `tipo_evento`, gera síntese via IA, salva em
  `monthly_briefings` e envia por e-mail (Resend) — agendado pro dia 1 às 07h
  (Brasília) e também rodável na mão (`npm run briefing`)
- Logs estruturados (pino) com `rawMessageId` rastreável em toda a pipeline
- `Dockerfile` de produção (multi-stage) + `scripts/migrate.js` para aplicar
  o schema no banco de produção

## Deploy (Etapa 9)

1. Crie uma conta em **railway.app** (tem crédito grátis pra começar)
2. Instale a CLI: `npm install -g @railway/cli`
3. `railway login` (abre o navegador pra autenticar)
4. Dentro da pasta do projeto: `railway init` (cria um novo projeto Railway)
5. No painel do Railway (ou via CLI), adicione dois bancos de dados ao
   projeto: **PostgreSQL** e **Redis** — o Railway gera as `DATABASE_URL` e
   `REDIS_URL` automaticamente como variáveis do projeto
6. Configure as demais variáveis de ambiente no painel do Railway (Settings →
   Variables): `INGEST_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`,
   `RESEND_API_KEY`, `BRIEFING_RECIPIENT_EMAIL`, e as do WhatsApp se já
   estiverem prontas
7. Deploy: `railway up` (o Railway detecta o `Dockerfile` e builda a imagem)
8. Aplique o schema no banco de produção (uma vez só): `railway run node scripts/migrate.js`
9. Gere um domínio público (Settings → Networking → Generate Domain) e teste:
   ```bash
   curl https://<seu-dominio>.up.railway.app/health
   ```

## Próximos passos (seguindo o plano de construção)

- **Etapa 6**: número de teste do WhatsApp (pausado no meio — falta gerar o
  token de acesso, o app secret e configurar o webhook + ngrok)

## Variáveis de ambiente

> Para saber **onde cada variável está configurada de verdade** (local vs
> Railway) e o status atual de cada uma, ver [`ENVIRONMENT.md`](./ENVIRONMENT.md).
> Este arquivo abaixo só documenta o que cada campo faz.

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | conexão com o Postgres |
| `REDIS_URL` | sim (tem default local) | conexão com o Redis, usado pela fila |
| `INGEST_API_KEY` | sim | chave que a automação existente deve enviar no header `x-api-key` |
| `ANTHROPIC_API_KEY` | para a extração funcionar | chave da API Anthropic |
| `ANTHROPIC_MODEL` | não (tem default) | modelo usado na extração/briefing |
| `RESEND_API_KEY` | para o briefing mensal (Etapa 7) | envio do e-mail |
| `BRIEFING_RECIPIENT_EMAIL` | para o briefing mensal (Etapa 7) | destinatário do briefing |
| `WHATSAPP_VERIFY_TOKEN` | para o webhook de teste | token definido por você, usado na verificação do webhook |
| `WHATSAPP_APP_SECRET` | para o webhook de teste | valida a assinatura das mensagens recebidas |
| `WHATSAPP_ACCESS_TOKEN` | para enviar confirmação | token do app na Meta (temporário, expira em 24h) |
| `WHATSAPP_PHONE_NUMBER_ID` | para enviar confirmação | ID do número de teste/produção na Meta |
