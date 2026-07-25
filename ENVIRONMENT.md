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
