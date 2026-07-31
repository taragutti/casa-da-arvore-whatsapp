import { logger } from "../config/logger";
import { buscarConfiguracoes, Configuracoes, CONFIGURACOES_PADRAO } from "../repositories/configuracoes.repo";

/**
 * Acesso em memória à configuração operacional (estágio 8).
 *
 * Existe por um motivo de desempenho concreto: a configuração é lida no
 * processamento de CADA mensagem recebida (gatilhos de handoff, SLA, horário) e
 * em cada follow-up agendado. Consultar o banco todas as vezes acrescentaria
 * ida e volta a um caminho quente para dados que mudam algumas vezes por ano.
 *
 * O TTL é a peça que faz isso funcionar com mais de uma instância do app: a
 * gravação limpa o cache LOCAL, e as outras instâncias convergem em até
 * TTL_MS. Configuração operacional tolera bem essa janela — não vale a
 * complexidade de invalidação distribuída via Redis.
 */
const TTL_MS = 30_000;

let cache: { valor: Configuracoes; expiraEm: number } | null = null;

/** Zera o cache local. Chamado após gravar, para a mudança valer na hora nesta instância. */
export function invalidarCacheConfig(): void {
  cache = null;
}

export async function obterConfig(): Promise<Configuracoes> {
  if (cache && cache.expiraEm > Date.now()) return cache.valor;

  try {
    const doBanco = await buscarConfiguracoes();
    if (doBanco) {
      cache = { valor: doBanco, expiraEm: Date.now() + TTL_MS };
      return doBanco;
    }
    // Tabela existe mas está sem linha: usa padrão em vez de falhar.
    logger.warn("tabela configuracoes sem linha — usando padrões do código");
  } catch (error) {
    // Falha de leitura NÃO pode derrubar o processamento de mensagem. O padrão
    // é o mesmo comportamento que o sistema tinha antes do estágio 8, então
    // degradar para ele é seguro e previsível.
    logger.error({ err: error }, "falha ao ler configuracoes — usando padrões do código");
  }

  // Cacheia o padrão por um tempo curto para não repetir a consulta que falhou
  // a cada mensagem, mas voltar a tentar logo.
  cache = { valor: CONFIGURACOES_PADRAO, expiraEm: Date.now() + 5_000 };
  return CONFIGURACOES_PADRAO;
}
