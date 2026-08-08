import { describe, it, expect } from "vitest";
import { idParamSchema, atualizacaoSchema, notaSchema, mensagemConversaSchema } from "./leadsApi.schemas";

const UUID_VALIDO = "9cadaae2-b023-47b5-bb75-69d544d7e01b";

describe("idParamSchema", () => {
  it("aceita UUID válido", () => {
    expect(idParamSchema.safeParse(UUID_VALIDO).success).toBe(true);
  });

  it("rejeita id que não é UUID — evita query com valor inválido chegando no Postgres", () => {
    expect(idParamSchema.safeParse("123").success).toBe(false);
    expect(idParamSchema.safeParse("").success).toBe(false);
    expect(idParamSchema.safeParse("'; DROP TABLE leads; --").success).toBe(false);
  });
});

describe("atualizacaoSchema", () => {
  it("aceita mudança de etapa do funil", () => {
    const r = atualizacaoSchema.safeParse({ status: "negociacao" });
    expect(r.success).toBe(true);
  });

  it("aceita confirmação de unidade", () => {
    expect(atualizacaoSchema.safeParse({ unidade_confirmada: "casarao" }).success).toBe(true);
  });

  it("aceita devolver ao bot", () => {
    expect(atualizacaoSchema.safeParse({ devolver_ao_bot: true }).success).toBe(true);
  });

  it("aceita os três campos juntos", () => {
    const r = atualizacaoSchema.safeParse({
      status: "fechado",
      unidade_confirmada: "casa_por_do_sol",
      devolver_ao_bot: true,
    });
    expect(r.success).toBe(true);
  });

  it("rejeita corpo vazio — evita PATCH que não faz nada passar como sucesso", () => {
    expect(atualizacaoSchema.safeParse({}).success).toBe(false);
  });

  it("aceita correção de nome e apara espaços", () => {
    const r = atualizacaoSchema.safeParse({ nome_cliente: "  Maria Silva  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.nome_cliente).toBe("Maria Silva");
  });

  it("rejeita nome vazio — apagaria o nome do lead sem intenção", () => {
    expect(atualizacaoSchema.safeParse({ nome_cliente: "   " }).success).toBe(false);
  });

  it("normaliza telefone pra dígitos-only — mesmo formato que o webhook grava", () => {
    for (const entrada of ["+5522997546818", "55 (22) 99754-6818", "5522997546818"]) {
      const r = atualizacaoSchema.safeParse({ whatsapp_number: entrada });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.whatsapp_number).toBe("5522997546818");
    }
  });

  it("rejeita telefone sem código do país — quebraria o vínculo com o WhatsApp", () => {
    expect(atualizacaoSchema.safeParse({ whatsapp_number: "22997546818" }).success).toBe(false);
    expect(atualizacaoSchema.safeParse({ whatsapp_number: "abc" }).success).toBe(false);
  });

  it("rejeita status fora do enum do banco", () => {
    expect(atualizacaoSchema.safeParse({ status: "em_andamento" }).success).toBe(false);
    expect(atualizacaoSchema.safeParse({ status: "NOVO" }).success).toBe(false);
  });

  it("rejeita unidade fora do enum do banco", () => {
    expect(atualizacaoSchema.safeParse({ unidade_confirmada: "casa_da_praia" }).success).toBe(false);
  });

  it("rejeita devolver_ao_bot: false — remarcar como atendimento humano não é suportado por esta rota", () => {
    expect(atualizacaoSchema.safeParse({ devolver_ao_bot: false }).success).toBe(false);
  });

  it("aceita todos os status do enum, pra o funil inteiro ser navegável", () => {
    for (const status of ["novo", "qualificando", "proposta_enviada", "negociacao", "fechado", "perdido"]) {
      expect(atualizacaoSchema.safeParse({ status }).success, status).toBe(true);
    }
  });

  it("aceita todas as 5 unidades", () => {
    for (const u of ["casa_da_arvore", "park_lagos", "shopping_park_lagos", "casarao", "casa_por_do_sol"]) {
      expect(atualizacaoSchema.safeParse({ unidade_confirmada: u }).success, u).toBe(true);
    }
  });
});

describe("notaSchema", () => {
  it("aceita nota apenas com o texto", () => {
    expect(notaSchema.safeParse({ texto: "Ligou, não atendeu" }).success).toBe(true);
  });

  it("IGNORA autor enviado no corpo — a autoria vem da sessão, senão a nota não provaria quem escreveu", () => {
    const r = notaSchema.safeParse({ texto: "Cliente pediu proposta", autor: "Alguém Que Não Sou" });
    expect(r.success).toBe(true);
    // Se este campo voltar a ser aceito, qualquer cliente poderia falsificar autoria.
    expect(r.success && "autor" in r.data).toBe(false);
  });

  it("rejeita texto vazio ou só espaços", () => {
    expect(notaSchema.safeParse({ texto: "" }).success).toBe(false);
    expect(notaSchema.safeParse({ texto: "   " }).success).toBe(false);
  });

  it("apara espaços em volta do texto", () => {
    const r = notaSchema.safeParse({ texto: "  anotação  " });
    expect(r.success && r.data.texto).toBe("anotação");
  });

  it("rejeita texto acima de 2000 caracteres", () => {
    expect(notaSchema.safeParse({ texto: "a".repeat(2001) }).success).toBe(false);
    expect(notaSchema.safeParse({ texto: "a".repeat(2000) }).success).toBe(true);
  });
});

describe("mensagemConversaSchema", () => {
  it("aceita texto normal e apara espaços", () => {
    const r = mensagemConversaSchema.safeParse({ texto: "  Oi Maria, tudo bem?  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.texto).toBe("Oi Maria, tudo bem?");
  });

  it("recusa vazio e só-espaços", () => {
    expect(mensagemConversaSchema.safeParse({ texto: "" }).success).toBe(false);
    expect(mensagemConversaSchema.safeParse({ texto: "   " }).success).toBe(false);
  });

  it("recusa acima do limite da Cloud API (4096)", () => {
    expect(mensagemConversaSchema.safeParse({ texto: "a".repeat(4097) }).success).toBe(false);
    expect(mensagemConversaSchema.safeParse({ texto: "a".repeat(4096) }).success).toBe(true);
  });
});
