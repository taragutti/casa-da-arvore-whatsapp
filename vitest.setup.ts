// Executado antes de cada arquivo de teste. Preenche variáveis de ambiente
// obrigatórias (config/env.ts valida com zod na importação) com valores
// fictícios — os testes não fazem chamadas reais à API nem ao banco.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INGEST_API_KEY ??= "chave-de-teste";
process.env.ANTHROPIC_API_KEY ??= "sk-ant-chave-fake-para-teste";
