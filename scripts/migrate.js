/**
 * Aplica o schema.sql no banco apontado por DATABASE_URL. Rodar uma vez,
 * manualmente, a primeira vez que o banco de produção é criado (ex: no
 * Railway, que não tem o docker-entrypoint-initdb.d do Docker Compose local).
 *
 * Uso: DATABASE_URL=postgresql://... node scripts/migrate.js
 * No Railway: railway run node scripts/migrate.js
 *
 * É JS puro (não TypeScript) de propósito — assim roda direto com `node`,
 * sem precisar do tsx/typescript instalados na imagem de produção.
 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida. Exporte a variável antes de rodar este script.");
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, "..", "src", "db", "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log("Aplicando schema.sql...");
  try {
    await pool.query(schemaSql);
    console.log("Schema aplicado com sucesso.");
  } catch (error) {
    console.error("Falha ao aplicar o schema:", error.message);
    console.error(
      "Se o erro for sobre um tipo/tabela já existir, provavelmente o schema já foi aplicado antes — pode ignorar."
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
