import fs from "fs/promises";
import os from "os";
import path from "path";
import express from "express";
import { AddressInfo } from "net";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// Diretório temporário de mídia definido ANTES de importar qualquer módulo:
// config/env.ts lê process.env na importação.
const DIRETORIO = path.join(os.tmpdir(), `midia-teste-${process.pid}`);
process.env.MEDIA_STORAGE_DIR = DIRETORIO;
process.env.PUBLIC_BASE_URL = "https://teste.example.com";

/**
 * Banco simulado no lugar de `pool`. Testar a rota de upload de ponta a ponta
 * sem Postgres é o que permite verificar o que mais importa aqui: a ORDEM entre
 * gravar arquivo e gravar registro. Um registro apontando pra arquivo que não
 * existe é o pior estado possível — o motor de mídia acha que tem mídia, envia
 * a URL pra Meta e o envio falha na frente do cliente.
 */
const linhas: Record<string, unknown>[] = [];
let falharNoInsert = false;

vi.mock("../db/client", () => ({
  pool: {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("SELECT codigo FROM media_library WHERE codigo LIKE")) {
        const prefixo = String(params?.[0] ?? "").replace(/%$/, "");
        const casando = linhas
          .map((l) => String(l.codigo))
          .filter((c) => c.startsWith(prefixo))
          .sort()
          .reverse();
        return { rows: casando.length ? [{ codigo: casando[0] }] : [], rowCount: casando.length };
      }
      if (sql.includes("INSERT INTO media_library")) {
        if (falharNoInsert) throw new Error("falha simulada no banco");
        const [codigo, unidade, tipo, categoria, perfil_lead, url] = params as string[];
        const linha = { codigo, unidade, tipo, categoria, perfil_lead, url, ativo: true };
        linhas.push(linha);
        return { rows: [linha], rowCount: 1 };
      }
      if (sql.includes("DELETE FROM media_library")) {
        const antes = linhas.length;
        const indice = linhas.findIndex((l) => l.codigo === (params as string[])[0]);
        if (indice >= 0) linhas.splice(indice, 1);
        return { rows: [], rowCount: antes - linhas.length };
      }
      if (sql.includes("SELECT codigo, unidade")) {
        const encontrada = linhas.find((l) => l.codigo === (params as string[])?.[0]);
        return { rows: encontrada ? [encontrada] : linhas, rowCount: encontrada ? 1 : linhas.length };
      }
      if (sql.includes("UPDATE media_library")) {
        const [codigo, ativo] = params as [string, boolean];
        const linha = linhas.find((l) => l.codigo === codigo);
        if (linha) linha.ativo = ativo;
        return { rows: [], rowCount: linha ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    }),
  },
}));

// Autenticação e permissão são testadas em outro lugar; aqui interessa o
// comportamento da rota — por isso o autor simulado já entra como admin.
vi.mock("../middleware/auth", () => ({
  exigirLogin: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.autor = { usuarioId: "u-1", nome: "Teste", compartilhado: false, papel: "admin", unidades: [] };
    next();
  },
  exigirAdmin: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

let base: string;
let servidor: ReturnType<express.Express["listen"]>;

beforeAll(async () => {
  const { midiasApiRouter } = await import("./midiasApi");
  const { tratarErros } = await import("../middleware/asyncHandler");

  const app = express();
  app.use(express.json());
  app.use(midiasApiRouter);
  app.use(tratarErros);

  servidor = app.listen(0);
  await new Promise((resolver) => servidor.once("listening", resolver));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(async () => {
  servidor.close();
  await fs.rm(DIRETORIO, { recursive: true, force: true });
});

beforeEach(async () => {
  linhas.length = 0;
  falharNoInsert = false;
  // Disco limpo por teste: sem isso, arquivo criado por um teste anterior
  // aparece na verificação do seguinte e o resultado deixa de significar algo.
  await fs.rm(DIRETORIO, { recursive: true, force: true });
  await fs.mkdir(DIRETORIO, { recursive: true });
});

function enviar(query: string, corpo: Buffer, contentType: string) {
  return fetch(`${base}/api/midias?${query}`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(corpo),
  });
}

const FOTO = Buffer.from("bytes-de-uma-foto");

describe("POST /api/midias", () => {
  it("cadastra a mídia, grava o arquivo e devolve URL pública absoluta", async () => {
    const resp = await enviar("unidade=casa_da_arvore&etapa=1", FOTO, "image/jpeg");
    expect(resp.status).toBe(201);

    const item = await resp.json();
    expect(item.codigo).toBe("ARV-FOT-EXT-GER-01");
    expect(item.tipo).toBe("foto");
    expect(item.categoria).toBe("externa");
    expect(item.perfil_lead).toBeNull();
    // Absoluta: a Meta baixa o arquivo do nosso servidor, URL relativa não serve.
    expect(item.url).toBe("https://teste.example.com/midia/ARV-FOT-EXT-GER-01.jpg");

    const gravado = await fs.readFile(path.join(DIRETORIO, "ARV-FOT-EXT-GER-01.jpg"));
    expect(gravado.equals(FOTO)).toBe(true);
  });

  it("mapeia cada etapa para o tipo/categoria que o motor de mídia consulta", async () => {
    const etapa2 = await (await enviar("unidade=casarao&etapa=2", Buffer.from("v"), "video/mp4")).json();
    expect([etapa2.tipo, etapa2.categoria]).toEqual(["video", "tour"]);

    const etapa3 = await (await enviar("unidade=casarao&etapa=3", FOTO, "image/png")).json();
    expect([etapa3.tipo, etapa3.categoria]).toEqual(["foto", "evento"]);

    const etapa4 = await (await enviar("unidade=casarao&etapa=4", Buffer.from("%PDF"), "application/pdf")).json();
    expect([etapa4.tipo, etapa4.categoria]).toEqual(["catalogo", "catalogo"]);
  });

  it("numera em sequência dentro do mesmo prefixo e separa por perfil", async () => {
    const um = await (await enviar("unidade=park_lagos&etapa=3&perfil_lead=infantil_grande", FOTO, "image/jpeg")).json();
    const dois = await (await enviar("unidade=park_lagos&etapa=3&perfil_lead=infantil_grande", FOTO, "image/jpeg")).json();
    expect([um.codigo, dois.codigo]).toEqual(["PKL-FOT-EVT-INF-G-01", "PKL-FOT-EVT-INF-G-02"]);

    // Perfil diferente é outra sequência — e o padrão bate com o do schema.sql.
    const outro = await (await enviar("unidade=park_lagos&etapa=3&perfil_lead=destination", FOTO, "image/jpeg")).json();
    expect(outro.codigo).toBe("PKL-FOT-EVT-DST-01");
  });

  it("recusa formato incompatível com a etapa sem deixar arquivo no disco", async () => {
    const resp = await enviar("unidade=casarao&etapa=1", Buffer.from("%PDF"), "application/pdf");
    expect(resp.status).toBe(400);
    expect((await resp.json()).erro).toMatch(/não aceito/i);

    const arquivos = await fs.readdir(DIRETORIO);
    expect(arquivos.filter((a) => a.startsWith("CSR-FOT"))).toEqual([]);
  });

  it("explica o caso do vídeo .mov, que é o erro mais provável de quem sobe do iPhone", async () => {
    const resp = await enviar("unidade=casarao&etapa=2", Buffer.from("mov"), "video/quicktime");
    expect(resp.status).toBe(400);
    expect((await resp.json()).erro).toMatch(/\.mp4/);
  });

  it("recusa unidade e etapa inválidas", async () => {
    expect((await enviar("unidade=casa_inexistente&etapa=1", FOTO, "image/jpeg")).status).toBe(400);
    expect((await enviar("unidade=casarao&etapa=9", FOTO, "image/jpeg")).status).toBe(400);
  });

  it("não deixa arquivo órfão quando o registro no banco falha", async () => {
    falharNoInsert = true;
    const resp = await enviar("unidade=casa_por_do_sol&etapa=1", FOTO, "image/jpeg");
    expect(resp.status).toBe(500);

    // O arquivo precisa ter sido removido: arquivo sem registro é inofensivo,
    // mas aqui verificamos que a limpeza aconteceu de fato.
    const arquivos = await fs.readdir(DIRETORIO);
    expect(arquivos.filter((a) => a.startsWith("CPS-"))).toEqual([]);
  });

  it("recusa corpo vazio", async () => {
    const resp = await enviar("unidade=casarao&etapa=1", Buffer.alloc(0), "image/jpeg");
    expect(resp.status).toBe(400);
  });
});

describe("PATCH e DELETE /api/midias/:codigo", () => {
  it("desativa sem apagar o arquivo do disco", async () => {
    const item = await (await enviar("unidade=casa_da_arvore&etapa=1", FOTO, "image/jpeg")).json();

    const resp = await fetch(`${base}/api/midias/${item.codigo}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: false }),
    });
    expect(resp.status).toBe(200);
    expect(linhas.find((l) => l.codigo === item.codigo)?.ativo).toBe(false);

    // Arquivo continua lá: desativar é reversível, remover não.
    await expect(fs.access(path.join(DIRETORIO, `${item.codigo}.jpg`))).resolves.toBeUndefined();
  });

  it("remove registro e arquivo juntos", async () => {
    const item = await (await enviar("unidade=shopping_park_lagos&etapa=1", FOTO, "image/jpeg")).json();
    const caminho = path.join(DIRETORIO, `${item.codigo}.jpg`);

    const resp = await fetch(`${base}/api/midias/${item.codigo}`, { method: "DELETE" });
    expect(resp.status).toBe(200);
    expect(linhas.find((l) => l.codigo === item.codigo)).toBeUndefined();
    await expect(fs.access(caminho)).rejects.toThrow();
  });

  it("responde 404 para código inexistente e 400 para código malformado", async () => {
    expect((await fetch(`${base}/api/midias/ARV-FOT-EXT-GER-99`, { method: "DELETE" })).status).toBe(404);
    expect((await fetch(`${base}/api/midias/..%2F..%2Fetc`, { method: "DELETE" })).status).toBe(400);
  });

  it("recusa PATCH sem o campo ativo", async () => {
    const resp = await fetch(`${base}/api/midias/ARV-FOT-EXT-GER-01`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(resp.status).toBe(400);
  });
});
