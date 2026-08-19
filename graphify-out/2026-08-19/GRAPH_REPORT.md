# Graph Report - CASA DA ARVORE FLUXO CRM  (2026-08-19)

## Corpus Check
- 117 files · ~86,486 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 805 nodes · 1803 edges · 42 communities (35 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `806d5792`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.ts
- monthlyBriefing.cron.ts
- What You Must Do When Invoked
- anthropic.service.ts
- compilerOptions
- dependencies
- devDependencies
- scripts
- Casa da Árvore — Automação Comercial e Inteligência de Demanda
- graphify reference: extra exports and benchmark
- graphify reference: query, path, explain
- migrate.js
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- anthropic.service.test.ts
- CLAUDE.md
- CLAUDE.md
- extraction-spec.md
- mediaEngine.service.ts
- email.service.ts
- messageProcessing.service.ts
- leads.repo.ts
- server.ts
- Onde paramos — 31/07/2026
- mediaLote.service.test.ts
- mediaEspera.service.test.ts
- midiasApi.test.ts
- messageProcessing.service.ts
- scriptEngine.service.ts
- scriptEngine.service.test.ts
- scripts
- package.json
- GatilhoHandoff
- node-cron
- whatsapp.service.ts
- usuariosApi.test.ts

## God Nodes (most connected - your core abstractions)
1. `logger` - 41 edges
2. `UnidadeRecomendada` - 31 edges
3. `escapeHtml()` - 31 edges
4. `sendWhatsAppMessage()` - 23 edges
5. `env` - 16 edges
6. `pool` - 16 edges
7. `normalizarNumero()` - 16 edges
8. `obterConfig()` - 16 edges
9. `encaminharMensagemDoClienteParaVendedor()` - 16 edges
10. `processarMensagemDoVendedor()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `extractFromMessage()`  [EXTRACTED]
  scripts/test-extract.ts → src/services/anthropic.service.ts
- `main()` --calls--> `buscarPorEmailComHash()`  [EXTRACTED]
  scripts/criar-usuario.ts → src/repositories/usuarios.repo.ts
- `main()` --calls--> `criarUsuario()`  [EXTRACTED]
  scripts/criar-usuario.ts → src/repositories/usuarios.repo.ts
- `main()` --calls--> `listarUsuarios()`  [EXTRACTED]
  scripts/criar-usuario.ts → src/repositories/usuarios.repo.ts
- `main()` --calls--> `hashSenha()`  [EXTRACTED]
  scripts/criar-usuario.ts → src/services/password.service.ts

## Import Cycles
- None detected.

## Communities (42 total, 7 thin omitted)

### Community 0 - "server.ts"
Cohesion: 0.18
Nodes (30): logger, devolverAoBot(), buscarContextoLead(), abrirAtendimento(), AtendimentoComAviso, AtendimentoRelay, buscarAtendimento(), fecharAtendimento() (+22 more)

### Community 1 - "monthlyBriefing.cron.ts"
Cohesion: 0.13
Nodes (26): mesAnterior(), pad2(), periodoDeString(), PeriodoRange, runMonthlyBriefingJob(), DemandSignalRow, findDemandSignalsBetween(), markBriefingAsSent() (+18 more)

### Community 2 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 3 - "anthropic.service.ts"
Cohesion: 0.10
Nodes (29): main(), MENSAGENS_DE_TESTE, ContextoDuvidaEmEspera, DadosPorRamo, extractFromMessage(), FormatoFesta15Anos, FORMATOS_15_ANOS, GatilhoEmocional (+21 more)

### Community 4 - "compilerOptions"
Cohesion: 0.09
Nodes (21): dist, ES2022, node_modules, src/**/*.test.ts, src/**/*.ts, compilerOptions, declaration, esModuleInterop (+13 more)

### Community 5 - "dependencies"
Cohesion: 0.12
Nodes (17): @anthropic-ai/sdk, bullmq, dotenv, express, ioredis, dependencies, @anthropic-ai/sdk, bullmq (+9 more)

### Community 6 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, pino-pretty, tsx, @types/express, @types/node, @types/node-cron, @types/pg, typescript (+9 more)

### Community 7 - "scripts"
Cohesion: 0.09
Nodes (45): pool, startMessageWorker(), apenasPreenchidos(), atualizarTentativasSemClassificacao(), EstadoHandoff, getEstadoHandoff(), marcarEmAtendimentoHumano(), upsertConversationState() (+37 more)

### Community 8 - "Casa da Árvore — Automação Comercial e Inteligência de Demanda"
Cohesion: 0.09
Nodes (20): Ambientes e Credenciais — Casa da Árvore, Checklist de variáveis, Como manter isso útil, Pendência aberta, Templates de ciclo de vida — submetidos em 05/08/2026, aguardando aprovação, Templates de mensagem da Meta, Validade da mensagem (TTL) — não é pendência, verificado em 05/08/2026, Vendedor que recebe o handoff (dois vendedores, por unidade) (+12 more)

### Community 9 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 10 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 11 - "migrate.js"
Cohesion: 0.40
Nodes (3): fs, path, { Pool }

### Community 12 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 13 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 14 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 23 - "mediaEngine.service.ts"
Cohesion: 0.10
Nodes (31): main(), perguntar(), perguntarSenha(), rl, saida, SaidaSilenciavel, atualizarAtivo(), atualizarPapel() (+23 more)

### Community 24 - "email.service.ts"
Cohesion: 0.06
Nodes (65): autenticarBootstrap(), Autor, autorPodeAcessarUnidade(), exigirAdmin(), exigirLogin(), express-serve-static-core, identificar(), lerCookie() (+57 more)

### Community 25 - "messageProcessing.service.ts"
Cohesion: 0.10
Nodes (29): ReguaFollowUp, AtualizacaoConfig, buscarConfiguracoes(), Configuracoes, CONFIGURACOES_PADRAO, daLinha(), LinhaConfig, salvarConfiguracoes() (+21 more)

### Community 26 - "leads.repo.ts"
Cohesion: 0.05
Nodes (40): FIM_RECREACAO, N0_COMERCIAL, N0_FORA_HORARIO, N1, N10C, N2A, N2B, N2C (+32 more)

### Community 28 - "server.ts"
Cohesion: 0.07
Nodes (40): buscarMidiaPorCodigo(), contarMidiasAtivasPorEtapa(), definirMidiaAtiva(), gerarProximoCodigo(), inserirMidia(), listarTodasMidias(), MediaItem, MediaItemAdmin (+32 more)

### Community 29 - "Onde paramos — 31/07/2026"
Cohesion: 0.11
Nodes (17): 0. ✅ Billing da Meta — resolvido em 05/08/2026 (tarde), 1. Primeiro usuário em produção — ✅ já existia, verificado em 05/08/2026, 2. `media_library` e volume de mídia — ✅ já resolvidos, verificado em 05/08/2026, 3. Templates da Meta — ✅ resolvido em 01/08/2026, 4. Dois vendedores por unidade (05/08/2026) — ✅ resolvido, Ambiente local, Aviso de ociosidade do vendedor + bot responde até 3 dúvidas (14/08), Decisões de arquitetura que não são óbvias no código (+9 more)

### Community 30 - "mediaLote.service.test.ts"
Cohesion: 0.07
Nodes (40): env, envSchema, parsed, PORT, redisApp, checkDbConnection(), scheduleLifecycleFollowUpJob(), scheduleMonthlyBriefingJob() (+32 more)

### Community 31 - "mediaEspera.service.test.ts"
Cohesion: 0.25
Nodes (7): agendarFollowUp, buscarMidias, enviarImagem, enviarTexto, FOTO, getEtapaMidiaAtual, registrarEnvioMidia

### Community 32 - "midiasApi.test.ts"
Cohesion: 0.40
Nodes (3): DIRETORIO, FOTO, linhas

### Community 33 - "messageProcessing.service.ts"
Cohesion: 0.08
Nodes (37): runLifecycleFollowUpJob(), TEMPLATES_CICLO_DE_VIDA, horarioAtualSaoPaulo(), runVendorDailyDigestJob(), scheduleVendorDailyDigestJob(), inserirNota(), listarNotas(), adicionarTag() (+29 more)

### Community 34 - "scriptEngine.service.ts"
Cohesion: 0.11
Nodes (20): casarOpcao(), CONVIDADOS_POR_FAIXA, convidadosDaFaixa(), EstadoScript, Faq, INVESTIMENTO_POR_FAIXA, investimentoDaFaixa(), NoQuePergunta (+12 more)

### Community 35 - "scriptEngine.service.test.ts"
Cohesion: 0.16
Nodes (17): Acao, avancar(), contem(), ContextoScript, detectarFaq(), detectarInterrupcao(), deveFazerN7C(), esperaResposta() (+9 more)

### Community 36 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, briefing, build, criar-usuario, dev, migrate, start, test (+2 more)

### Community 37 - "package.json"
Cohesion: 0.33
Nodes (5): description, name, private, type, version

### Community 38 - "GatilhoHandoff"
Cohesion: 0.67
Nodes (3): GatilhoHandoff, ResultadoHandoff, Interrupcao

### Community 40 - "whatsapp.service.ts"
Cohesion: 0.12
Nodes (33): registrarMensagemEnviada(), getEtapaMidiaAtual(), registrarEnvioMidia(), buscarMidias(), AcaoMidia, decidirProximaAcaoMidia(), enviarEtapaMidia(), enviarLoteDeFotos() (+25 more)

### Community 42 - "usuariosApi.test.ts"
Cohesion: 0.25
Nodes (5): CRIAR_ATENDENTE, LinhaUsuario, unidadesPorUsuario, usuarios, usuariosComNotas

## Knowledge Gaps
- **275 isolated node(s):** `name`, `version`, `description`, `private`, `type` (+270 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `logger` connect `server.ts` to `messageProcessing.service.ts`, `monthlyBriefing.cron.ts`, `anthropic.service.ts`, `scripts`, `whatsapp.service.ts`, `mediaEngine.service.ts`, `email.service.ts`, `messageProcessing.service.ts`, `server.ts`, `mediaLote.service.test.ts`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `UnidadeRecomendada` connect `messageProcessing.service.ts` to `messageProcessing.service.ts`, `monthlyBriefing.cron.ts`, `anthropic.service.ts`, `scriptEngine.service.ts`, `scripts`, `whatsapp.service.ts`, `mediaEngine.service.ts`, `email.service.ts`, `leads.repo.ts`, `server.ts`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `escapeHtml()` connect `email.service.ts` to `monthlyBriefing.cron.ts`, `mediaLote.service.test.ts`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _275 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `monthlyBriefing.cron.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13306451612903225 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `anthropic.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09803921568627451 - nodes in this community are weakly interconnected._