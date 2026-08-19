import crypto from "crypto";
import express from "express";
import { AddressInfo } from "net";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

/**
 * Banco simulado, no mesmo espírito de midiasApi.test.ts: o que importa aqui
 * é a regra de negócio da rota (normalização de unidades por papel, e
 * principalmente a trava do último admin), não o SQL em si.
 */
interface LinhaUsuario {
  id: string;
  email: string;
  nome: string;
  senha_hash: string;
  ativo: boolean;
  papel: "admin" | "atendente";
  telefone: string | null;
  created_at: string;
  ultimo_login_em: string | null;
}

// UUID fixo (não random) porque o mock de auth precisa dele em tempo de
// import, antes de qualquer `beforeEach` rodar.
const ID_ADMIN_LOGADO = "00000000-0000-4000-8000-000000000001";

let usuarios: LinhaUsuario[] = [];
let unidadesPorUsuario: Record<string, string[]> = {};
// Simula usuário com nota registrada em lead — a rota deve recusar exclusão
// com a mesma violação de FK que o Postgres real devolveria.
let usuariosComNotas: Set<string> = new Set();

vi.mock("../db/client", () => ({
  pool: {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const p = params ?? [];

      if (sql.includes("SELECT id, email, nome, ativo, papel, telefone, senha_hash FROM usuarios WHERE lower(email)")) {
        const email = String(p[0]).toLowerCase();
        const u = usuarios.find((u) => u.email.toLowerCase() === email);
        return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
      }
      if (sql.includes("SELECT id, email, nome, ativo, papel, telefone FROM usuarios WHERE id")) {
        const u = usuarios.find((u) => u.id === p[0]);
        return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
      }
      if (sql.includes("INSERT INTO usuarios")) {
        const [email, nome, senha_hash, papel, telefone] = p as [string, string, string, string, string | null];
        const linha: LinhaUsuario = {
          id: crypto.randomUUID(),
          email,
          nome,
          senha_hash,
          papel: papel as "admin" | "atendente",
          telefone: telefone ?? null,
          ativo: true,
          created_at: new Date().toISOString(),
          ultimo_login_em: null,
        };
        usuarios.push(linha);
        // Mesma coisa que o RETURNING real: sem senha_hash no que volta pra rota.
        const { senha_hash: _senha_hash, ...semHash } = linha;
        return { rows: [semHash], rowCount: 1 };
      }
      if (sql.includes("SELECT id, email, nome, ativo, papel, telefone, created_at, ultimo_login_em FROM usuarios")) {
        return { rows: usuarios, rowCount: usuarios.length };
      }
      if (sql.includes("SELECT usuario_id, unidade FROM usuario_unidades WHERE usuario_id = ANY")) {
        const ids = p[0] as string[];
        const linhas = ids.flatMap((id) => (unidadesPorUsuario[id] ?? []).map((unidade) => ({ usuario_id: id, unidade })));
        return { rows: linhas, rowCount: linhas.length };
      }
      if (sql.includes("DELETE FROM usuario_unidades")) {
        delete unidadesPorUsuario[p[0] as string];
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("INSERT INTO usuario_unidades")) {
        const [usuarioId, ...unidades] = p as string[];
        unidadesPorUsuario[usuarioId] = unidades;
        return { rows: [], rowCount: unidades.length };
      }
      if (sql.includes("UPDATE usuarios SET papel")) {
        const u = usuarios.find((u) => u.id === p[0]);
        if (u) u.papel = p[1] as "admin" | "atendente";
        return { rows: [], rowCount: u ? 1 : 0 };
      }
      if (sql.includes("UPDATE usuarios SET ativo")) {
        const u = usuarios.find((u) => u.id === p[0]);
        if (u) u.ativo = p[1] as boolean;
        return { rows: [], rowCount: u ? 1 : 0 };
      }
      if (sql.includes("SELECT count(*) FROM usuarios WHERE ativo = true AND papel = 'admin'")) {
        const excluir = p[0] as string | null;
        const n = usuarios.filter((u) => u.ativo && u.papel === "admin" && u.id !== excluir).length;
        return { rows: [{ count: String(n) }], rowCount: 1 };
      }
      if (sql.startsWith("UPDATE usuarios SET") && (sql.includes("nome") || sql.includes("email"))) {
        const usuarioId = p[0] as string;
        const u = usuarios.find((u) => u.id === usuarioId);
        if (u) {
          // Mesma ordem de parâmetros que atualizarPerfil monta: nome antes de email quando os dois vêm juntos.
          let i = 1;
          if (sql.includes("nome")) u.nome = p[i++] as string;
          if (sql.includes("email")) u.email = p[i++] as string;
        }
        return { rows: [], rowCount: u ? 1 : 0 };
      }
      if (sql.includes("DELETE FROM usuarios WHERE id")) {
        const usuarioId = p[0] as string;
        if (usuariosComNotas.has(usuarioId)) {
          const erro = new Error("violação de chave estrangeira em lead_notes") as Error & { code: string };
          erro.code = "23503";
          throw erro;
        }
        const antes = usuarios.length;
        usuarios = usuarios.filter((u) => u.id !== usuarioId);
        return { rows: [], rowCount: antes - usuarios.length };
      }
      return { rows: [], rowCount: 0 };
    }),
  },
}));

vi.mock("../services/password.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/password.service")>()),
  hashSenha: async (senha: string) => `hash(${senha})`,
}));

// Autenticação/permissão testadas em outro lugar; aqui o autor simulado
// sempre entra como admin — a rota inteira já é admin-only.
vi.mock("../middleware/auth", () => ({
  exigirLogin: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.autor = { usuarioId: ID_ADMIN_LOGADO, nome: "Quem Loga", compartilhado: false, papel: "admin", unidades: [] };
    next();
  },
  exigirAdmin: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

let base: string;
let servidor: ReturnType<express.Express["listen"]>;

beforeAll(async () => {
  const { usuariosApiRouter } = await import("./usuariosApi");
  const { tratarErros } = await import("../middleware/asyncHandler");

  const app = express();
  app.use(express.json());
  app.use(usuariosApiRouter);
  app.use(tratarErros);

  servidor = app.listen(0);
  await new Promise((resolver) => servidor.once("listening", resolver));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => servidor.close());

beforeEach(() => {
  usuarios = [];
  unidadesPorUsuario = {};
  usuariosComNotas = new Set();
});

const CRIAR_ATENDENTE = {
  email: "ana@casadaarvoreadventure.com.br",
  nome: "Ana",
  senha: "senha-forte-123",
  papel: "atendente",
  unidades: ["casarao"],
};

describe("POST /api/usuarios", () => {
  it("cria usuário e devolve sem o hash da senha", async () => {
    const resp = await fetch(`${base}/api/usuarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(CRIAR_ATENDENTE),
    });
    expect(resp.status).toBe(201);
    const corpo = await resp.json();
    expect(corpo.email).toBe(CRIAR_ATENDENTE.email);
    expect(corpo.unidades).toEqual(["casarao"]);
    expect(corpo.senha_hash).toBeUndefined();
  });

  it("recusa e-mail já cadastrado", async () => {
    await fetch(`${base}/api/usuarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(CRIAR_ATENDENTE),
    });
    const resp = await fetch(`${base}/api/usuarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(CRIAR_ATENDENTE),
    });
    expect(resp.status).toBe(409);
  });

  it("zera unidades quando o papel é admin, mesmo que o corpo mande alguma", async () => {
    const resp = await fetch(`${base}/api/usuarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...CRIAR_ATENDENTE, email: "bia@x.com", papel: "admin" }),
    });
    const corpo = await resp.json();
    expect(corpo.unidades).toEqual([]);
  });
});

describe("PATCH /api/usuarios/:id — trava do último admin", () => {
  async function criar(dados: Partial<typeof CRIAR_ATENDENTE> & { papel: string }) {
    const resp = await fetch(`${base}/api/usuarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...CRIAR_ATENDENTE, unidades: [], ...dados }),
    });
    return resp.json();
  }

  it("recusa rebaixar o único admin ativo", async () => {
    const admin = await criar({ email: "unico@x.com", papel: "admin" });

    const resp = await fetch(`${base}/api/usuarios/${admin.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ papel: "atendente" }),
    });
    expect(resp.status).toBe(400);
    const corpo = await resp.json();
    expect(corpo.erro).toMatch(/último administrador/i);
  });

  it("recusa desativar o único admin ativo", async () => {
    const admin = await criar({ email: "unico2@x.com", papel: "admin" });

    const resp = await fetch(`${base}/api/usuarios/${admin.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: false }),
    });
    expect(resp.status).toBe(400);
  });

  it("permite rebaixar um admin quando existe outro admin ativo", async () => {
    await criar({ email: "primeiro@x.com", papel: "admin" });
    const segundo = await criar({ email: "segundo@x.com", papel: "admin" });

    const resp = await fetch(`${base}/api/usuarios/${segundo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ papel: "atendente", unidades: ["casarao"] }),
    });
    expect(resp.status).toBe(200);
  });

  it("zera as unidades ao promover um atendente para admin", async () => {
    await criar({ email: "outro-admin@x.com", papel: "admin" }); // garante que sobra admin
    const atendente = await criar({ email: "ana2@x.com", papel: "atendente", unidades: ["casarao"] as never });

    await fetch(`${base}/api/usuarios/${atendente.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ papel: "admin" }),
    });

    const lista = await (await fetch(`${base}/api/usuarios`)).json();
    const linha = lista.find((u: { id: string }) => u.id === atendente.id);
    expect(linha.unidades).toEqual([]);
  });
});

async function criarUsuario(dados: Partial<typeof CRIAR_ATENDENTE> & { papel: string }) {
  const resp = await fetch(`${base}/api/usuarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...CRIAR_ATENDENTE, unidades: [], ...dados }),
  });
  return resp.json();
}

describe("PATCH /api/usuarios/:id — edita nome e e-mail", () => {
  it("corrige um e-mail digitado errado", async () => {
    const u = await criarUsuario({ email: "digitdo-errdo@x.com", papel: "atendente" });

    const resp = await fetch(`${base}/api/usuarios/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "corrigido@x.com" }),
    });
    expect(resp.status).toBe(200);

    const lista = await (await fetch(`${base}/api/usuarios`)).json();
    expect(lista.find((x: { id: string }) => x.id === u.id).email).toBe("corrigido@x.com");
  });

  it("recusa trocar para um e-mail já usado por outro usuário", async () => {
    await criarUsuario({ email: "ja-existe@x.com", papel: "atendente" });
    const outro = await criarUsuario({ email: "vai-tentar-trocar@x.com", papel: "atendente" });

    const resp = await fetch(`${base}/api/usuarios/${outro.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ja-existe@x.com" }),
    });
    expect(resp.status).toBe(409);
  });

  it("permite manter o próprio e-mail (não conflita consigo mesmo)", async () => {
    const u = await criarUsuario({ email: "mesmo@x.com", papel: "atendente" });

    const resp = await fetch(`${base}/api/usuarios/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "Mesmo@X.com", nome: "Nome Atualizado" }),
    });
    expect(resp.status).toBe(200);
  });
});

describe("DELETE /api/usuarios/:id", () => {
  it("exclui um usuário sem histórico", async () => {
    const u = await criarUsuario({ email: "duplicado@x.com", papel: "atendente" });

    const resp = await fetch(`${base}/api/usuarios/${u.id}`, { method: "DELETE" });
    expect(resp.status).toBe(200);

    const lista = await (await fetch(`${base}/api/usuarios`)).json();
    expect(lista.find((x: { id: string }) => x.id === u.id)).toBeUndefined();
  });

  it("recusa excluir a própria conta", async () => {
    const resp = await fetch(`${base}/api/usuarios/${ID_ADMIN_LOGADO}`, { method: "DELETE" });
    expect(resp.status).toBe(400);
    const corpo = await resp.json();
    expect(corpo.erro).toMatch(/própria conta/i);
  });

  it("recusa excluir o último admin ativo", async () => {
    const admin = await criarUsuario({ email: "unico-admin-delete@x.com", papel: "admin" });

    const resp = await fetch(`${base}/api/usuarios/${admin.id}`, { method: "DELETE" });
    expect(resp.status).toBe(400);
    const corpo = await resp.json();
    expect(corpo.erro).toMatch(/último administrador/i);
  });

  it("permite excluir um admin quando existe outro admin ativo", async () => {
    await criarUsuario({ email: "fica@x.com", papel: "admin" });
    const vaiSair = await criarUsuario({ email: "sai@x.com", papel: "admin" });

    const resp = await fetch(`${base}/api/usuarios/${vaiSair.id}`, { method: "DELETE" });
    expect(resp.status).toBe(200);
  });

  it("recusa excluir usuário com notas registradas — orienta a desativar", async () => {
    const u = await criarUsuario({ email: "tem-historico@x.com", papel: "atendente" });
    usuariosComNotas.add(u.id);

    const resp = await fetch(`${base}/api/usuarios/${u.id}`, { method: "DELETE" });
    expect(resp.status).toBe(409);
    const corpo = await resp.json();
    expect(corpo.erro).toMatch(/desative/i);

    const lista = await (await fetch(`${base}/api/usuarios`)).json();
    expect(lista.find((x: { id: string }) => x.id === u.id)).toBeDefined();
  });
});
