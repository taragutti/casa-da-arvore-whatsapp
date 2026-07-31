import crypto from "crypto";

/**
 * Hash de senha com scrypt, que vem no próprio Node — de propósito.
 *
 * bcrypt/argon2 exigiriam dependência com compilação nativa, o que adiciona
 * risco ao build da imagem Docker de produção. scrypt é memory-hard e aceito
 * pelo OWASP para senhas, então não há troca de segurança envolvida.
 *
 * Parâmetros: N=16384 (~16MB por hash), r=8, p=1.
 */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

/**
 * O hash guardado descreve os próprios parâmetros:
 *   scrypt$N$r$p$salt_hex$hash_hex
 * Assim dá pra endurecer os parâmetros no futuro sem invalidar as senhas já
 * cadastradas — a verificação usa o que está gravado, não a constante atual.
 */
export function hashSenha(senha: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_LEN);
    crypto.scrypt(
      senha,
      salt,
      KEY_LEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, derivada) => {
        if (err) return reject(err);
        resolve(
          `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derivada.toString("hex")}`
        );
      }
    );
  });
}

/** Compara em tempo constante — nunca com === , que vaza informação pelo tempo de resposta. */
export function verificarSenha(senha: string, hashGuardado: string): Promise<boolean> {
  return new Promise((resolve) => {
    const partes = hashGuardado.split("$");
    if (partes.length !== 6 || partes[0] !== "scrypt") return resolve(false);

    const N = Number(partes[1]);
    const r = Number(partes[2]);
    const p = Number(partes[3]);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return resolve(false);

    let salt: Buffer;
    let esperado: Buffer;
    try {
      salt = Buffer.from(partes[4], "hex");
      esperado = Buffer.from(partes[5], "hex");
    } catch {
      return resolve(false);
    }
    if (salt.length === 0 || esperado.length === 0) return resolve(false);

    crypto.scrypt(senha, salt, esperado.length, { N, r, p }, (err, derivada) => {
      if (err) return resolve(false);
      resolve(derivada.length === esperado.length && crypto.timingSafeEqual(derivada, esperado));
    });
  });
}

/** Requisito mínimo de senha. Deliberadamente simples: comprimento é o que mais importa na prática. */
export function validarForcaSenha(senha: string): string | null {
  if (senha.length < 10) return "A senha precisa ter pelo menos 10 caracteres.";
  if (/^\d+$/.test(senha)) return "A senha não pode ser só números.";
  return null;
}
