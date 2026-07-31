/**
 * Cria um usuário do painel.
 *
 *   npm run criar-usuario
 *
 * Interativo de propósito: a senha é digitada com o eco desligado, para não
 * ficar registrada no histórico do shell (o que aconteceria se fosse argumento
 * de linha de comando).
 */
import readline from "readline";
import { Writable } from "stream";
import { pool } from "../src/db/client";
import { hashSenha, validarForcaSenha } from "../src/services/password.service";
import { criarUsuario, buscarPorEmailComHash, listarUsuarios } from "../src/repositories/usuarios.repo";

/** Writable que engole a saída enquanto a senha é digitada. */
class SaidaSilenciavel extends Writable {
  silenciado = false;
  _write(chunk: unknown, _enc: unknown, cb: () => void) {
    if (!this.silenciado) process.stdout.write(chunk as Buffer);
    cb();
  }
}

const saida = new SaidaSilenciavel();
const rl = readline.createInterface({ input: process.stdin, output: saida, terminal: true });

function perguntar(texto: string): Promise<string> {
  return new Promise((resolve) => rl.question(texto, (r) => resolve(r.trim())));
}

async function perguntarSenha(texto: string): Promise<string> {
  process.stdout.write(texto);
  saida.silenciado = true;
  const senha = await new Promise<string>((resolve) => rl.question("", (r) => resolve(r)));
  saida.silenciado = false;
  process.stdout.write("\n");
  return senha;
}

async function main() {
  const existentes = await listarUsuarios();
  if (existentes.length > 0) {
    console.log(`\nUsuários já cadastrados (${existentes.length}):`);
    for (const u of existentes) {
      console.log(`  - ${u.nome} <${u.email}>${u.ativo ? "" : " (desativado)"}`);
    }
  } else {
    console.log("\nNenhum usuário cadastrado. Este será o primeiro —");
    console.log("a partir dele, a credencial compartilhada deixa de funcionar.");
  }

  console.log("");
  const email = await perguntar("E-mail: ");
  if (!email.includes("@")) throw new Error("E-mail inválido.");

  if (await buscarPorEmailComHash(email)) {
    throw new Error(`Já existe usuário com o e-mail ${email}.`);
  }

  const nome = await perguntar("Nome (aparece como autor das notas): ");
  if (!nome) throw new Error("Nome é obrigatório.");

  const senha = await perguntarSenha("Senha (mínimo 10 caracteres): ");
  const problema = validarForcaSenha(senha);
  if (problema) throw new Error(problema);

  const confirmacao = await perguntarSenha("Confirme a senha: ");
  if (senha !== confirmacao) throw new Error("As senhas não coincidem.");

  const usuario = await criarUsuario(email, nome, await hashSenha(senha));
  console.log(`\n✓ Usuário criado: ${usuario.nome} <${usuario.email}>`);
  console.log("  Entre em /login com esse e-mail e senha.\n");
}

main()
  .catch((erro) => {
    console.error(`\n✗ ${erro instanceof Error ? erro.message : String(erro)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await pool.end();
  });
