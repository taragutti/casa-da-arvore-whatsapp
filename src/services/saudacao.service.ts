import { pool } from "../db/client";

/**
 * Saudação de primeiro contato.
 *
 * Existe porque o filtro de relevância (PALAVRAS_RELEVANTES) só deixa passar
 * mensagem que cite festa/casamento/orçamento e afins — e a abertura mais comum
 * de conversa no WhatsApp é "oi" ou "bom dia". O resultado era silêncio
 * absoluto no primeiro contato, e o cliente concluindo que o número está morto.
 */

/**
 * Janela antes de saudar o mesmo número de novo.
 *
 * Não é "uma vez para sempre": quem some e volta semanas depois merece nova
 * apresentação. Não é "toda mensagem" tampouco: "oi" + "bom dia" + "tudo bem?"
 * em sequência renderia três apresentações iguais. 24h resolve os dois.
 */
const REPETIR_APOS_HORAS = 24;

/**
 * Período do dia no fuso de Brasília — o cliente está no Brasil, e o servidor
 * roda em UTC. Sem forçar o fuso, "boa noite" apareceria três horas cedo.
 *
 * Faixas conforme combinado: até meio-dia bom dia, até 18h boa tarde, depois
 * boa noite.
 */
export function periodoDoDia(agora: Date = new Date()): "bom dia" | "boa tarde" | "boa noite" {
  const hora = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(agora)
  );

  if (hora < 12) return "bom dia";
  if (hora < 18) return "boa tarde";
  return "boa noite";
}

export function montarSaudacao(agora: Date = new Date()): string {
  return `Olá, ${periodoDoDia(agora)}! 🌳 Sou a assistente virtual do Grupo Casa da Árvore. Me conta: que tipo de evento você está planejando?`;
}

/**
 * Registra a saudação e diz se ela deve ser enviada agora.
 *
 * Decidir e gravar na MESMA consulta é proposital: duas mensagens chegando
 * juntas são processadas em paralelo (a fila roda com concorrência 5), e um
 * "consulta, decide, grava" em passos separados deixaria as duas passarem pela
 * verificação antes de qualquer gravação — o cliente receberia a saudação
 * duplicada. O ON CONFLICT ... WHERE resolve no banco: só uma das duas
 * escritas afeta linha, e só essa recebe RETURNING.
 */
export async function registrarSaudacaoSeNecessario(whatsappNumber: string): Promise<boolean> {
  const r = await pool.query(
    `INSERT INTO saudacoes_enviadas (whatsapp_number, enviada_em)
     VALUES ($1, now())
     ON CONFLICT (whatsapp_number) DO UPDATE
       SET enviada_em = now()
       WHERE saudacoes_enviadas.enviada_em < now() - ($2 || ' hours')::interval
     RETURNING whatsapp_number`,
    [whatsappNumber, String(REPETIR_APOS_HORAS)]
  );
  return r.rowCount === 1;
}
