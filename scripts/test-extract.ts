/**
 * Script de teste rápido do serviço de extração via IA, sem precisar
 * do servidor nem do Postgres rodando. Útil pra confirmar que a
 * ANTHROPIC_API_KEY está funcionando e o prompt está extraindo certo.
 *
 * Uso: npm run test:extract
 */
import { extractFromMessage } from "../src/services/anthropic.service";

const MENSAGENS_DE_TESTE = [
  "Oi, gostaria de saber o orçamento para uma festa de aniversário infantil em setembro, umas 30 pessoas. Minha filha se chama Sofia e vai fazer 5 anos",
  "Bom dia, vocês fazem casamento? Estou preocupada com o preço, meu orçamento é bem apertado, uns 15 mil no máximo",
  "Oi tudo bem",
];

async function main() {
  for (const mensagem of MENSAGENS_DE_TESTE) {
    console.log("\n--- Mensagem ---");
    console.log(mensagem);
    try {
      const resultado = await extractFromMessage(mensagem);
      console.log("--- Extraído ---");
      console.log(JSON.stringify(resultado, null, 2));
    } catch (error) {
      console.error("Erro na extração:", error);
    }
  }
}

main();
