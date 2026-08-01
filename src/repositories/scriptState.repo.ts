import { pool } from "../db/client";
import { EstadoScript } from "../services/scriptEngine.service";

/**
 * Estado do script de atendimento, por número de WhatsApp.
 *
 * Chave é o número e não o lead porque a conversa começa antes do lead existir
 * — o cliente manda "oi", o bot precisa responder o N0 e lembrar disso na
 * próxima mensagem, e só lá na frente é que há dado suficiente para virar
 * lead. Mesmo raciocínio de `saudacoes_enviadas`.
 */
export async function obterEstadoScript(whatsappNumber: string): Promise<EstadoScript> {
  const r = await pool.query<{
    no_atual: string | null;
    respostas: Record<string, string>;
    fallbacks_consecutivos: number;
  }>(`SELECT no_atual, respostas, fallbacks_consecutivos FROM script_state WHERE whatsapp_number = $1`, [
    whatsappNumber,
  ]);

  const row = r.rows[0];
  return {
    noAtual: row?.no_atual ?? null,
    respostas: row?.respostas ?? {},
    fallbacksConsecutivos: row?.fallbacks_consecutivos ?? 0,
  };
}

export async function salvarEstadoScript(whatsappNumber: string, estado: EstadoScript): Promise<void> {
  await pool.query(
    `INSERT INTO script_state (whatsapp_number, no_atual, respostas, fallbacks_consecutivos, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, now())
     ON CONFLICT (whatsapp_number) DO UPDATE SET
       no_atual = EXCLUDED.no_atual,
       respostas = EXCLUDED.respostas,
       fallbacks_consecutivos = EXCLUDED.fallbacks_consecutivos,
       updated_at = now()`,
    [whatsappNumber, estado.noAtual, JSON.stringify(estado.respostas), estado.fallbacksConsecutivos]
  );
}

/**
 * Zera o fluxo de um número. Usado quando o atendimento humano devolve a
 * conversa ao bot — sem isso, o cliente voltaria exatamente para a pergunta
 * pendente de semanas atrás, sem contexto nenhum.
 */
export async function reiniciarEstadoScript(whatsappNumber: string): Promise<void> {
  await pool.query(`DELETE FROM script_state WHERE whatsapp_number = $1`, [whatsappNumber]);
}
