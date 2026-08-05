import { pool } from "../db/client";
import { UnidadeRecomendada } from "../services/routing.service";
import {
  RegrasHandoff,
  RegrasHorario,
  RegrasSla,
  RegrasVendedor,
  REGRAS_HANDOFF_PADRAO,
  REGRAS_HORARIO_PADRAO,
  REGRAS_SLA_PADRAO,
  REGRAS_VENDEDOR_PADRAO,
} from "../services/handoff.service";
import { ReguaFollowUp } from "../queue/followUpQueue";

/** Configuração operacional completa, do jeito que o resto do código consome. */
export interface Configuracoes {
  followUpMinutos: Record<ReguaFollowUp, number>;
  reagendamentoForaHorarioMinutos: number;
  horario: RegrasHorario;
  sla: RegrasSla;
  vendedor: RegrasVendedor;
  handoff: RegrasHandoff;
  atualizadoEm: Date | null;
  atualizadoPorNome: string | null;
}

/** Usada quando a tabela ainda não foi migrada — mantém o sistema de pé com o comportamento antigo. */
export const CONFIGURACOES_PADRAO: Configuracoes = {
  followUpMinutos: { "2h": 120, "48h": 2880, "7d": 10080, "30d": 43200 },
  reagendamentoForaHorarioMinutos: 60,
  horario: REGRAS_HORARIO_PADRAO,
  sla: REGRAS_SLA_PADRAO,
  vendedor: REGRAS_VENDEDOR_PADRAO,
  handoff: REGRAS_HANDOFF_PADRAO,
  atualizadoEm: null,
  atualizadoPorNome: null,
};

interface LinhaConfig {
  followup_2h_minutos: number;
  followup_48h_minutos: number;
  followup_7d_minutos: number;
  followup_30d_minutos: number;
  reagendamento_fora_horario_minutos: number;
  hora_abertura: number;
  hora_fechamento: number;
  atende_sabado: boolean;
  atende_domingo: boolean;
  sla_minutos: Record<string, number>;
  sla_corporativo_minutos: number;
  sla_sem_unidade_minutos: number;
  vendedor_whatsapp_por_unidade: Record<string, string>;
  vendedor_whatsapp_padrao: string;
  palavras_reclamacao: string[];
  palavras_pedido_humano: string[];
  palavras_pedido_contrato: string[];
  tentativas_sem_classificacao_limite: number;
  atualizado_em: Date | null;
  atualizado_por_nome: string | null;
}

function daLinha(l: LinhaConfig): Configuracoes {
  return {
    followUpMinutos: {
      "2h": l.followup_2h_minutos,
      "48h": l.followup_48h_minutos,
      "7d": l.followup_7d_minutos,
      "30d": l.followup_30d_minutos,
    },
    reagendamentoForaHorarioMinutos: l.reagendamento_fora_horario_minutos,
    horario: {
      horaAbertura: l.hora_abertura,
      horaFechamento: l.hora_fechamento,
      atendeSabado: l.atende_sabado,
      atendeDomingo: l.atende_domingo,
    },
    sla: {
      // O JSON salvo pode não ter uma unidade adicionada depois no código, então
      // o padrão preenche as faltantes em vez de deixar `undefined` vazar.
      porUnidade: { ...REGRAS_SLA_PADRAO.porUnidade, ...l.sla_minutos } as Record<UnidadeRecomendada, number>,
      corporativo: l.sla_corporativo_minutos,
      semUnidade: l.sla_sem_unidade_minutos,
    },
    vendedor: {
      porUnidade: {
        ...REGRAS_VENDEDOR_PADRAO.porUnidade,
        ...l.vendedor_whatsapp_por_unidade,
      } as Record<UnidadeRecomendada, string>,
      padrao: l.vendedor_whatsapp_padrao,
    },
    handoff: {
      palavrasReclamacao: l.palavras_reclamacao,
      palavrasPedidoHumano: l.palavras_pedido_humano,
      palavrasPedidoContrato: l.palavras_pedido_contrato,
      tentativasSemClassificacaoLimite: l.tentativas_sem_classificacao_limite,
    },
    atualizadoEm: l.atualizado_em,
    atualizadoPorNome: l.atualizado_por_nome,
  };
}

export async function buscarConfiguracoes(): Promise<Configuracoes | null> {
  const r = await pool.query<LinhaConfig>(
    `SELECT c.*, u.nome AS atualizado_por_nome
       FROM configuracoes c
       LEFT JOIN usuarios u ON u.id = c.atualizado_por
      WHERE c.id = true`
  );
  return r.rows[0] ? daLinha(r.rows[0]) : null;
}

export interface AtualizacaoConfig {
  followUpMinutos: Record<ReguaFollowUp, number>;
  reagendamentoForaHorarioMinutos: number;
  horario: RegrasHorario;
  sla: RegrasSla;
  vendedor: RegrasVendedor;
  handoff: RegrasHandoff;
}

export async function salvarConfiguracoes(dados: AtualizacaoConfig, usuarioId: string | null): Promise<Configuracoes> {
  // UPSERT em vez de UPDATE: se a linha não existir (banco migrado por caminho
  // diferente), gravar cria — em vez de a tela salvar "com sucesso" sem efeito.
  const r = await pool.query<LinhaConfig>(
    `INSERT INTO configuracoes (
       id, followup_2h_minutos, followup_48h_minutos, followup_7d_minutos, followup_30d_minutos,
       reagendamento_fora_horario_minutos, hora_abertura, hora_fechamento, atende_sabado, atende_domingo,
       sla_minutos, sla_corporativo_minutos, sla_sem_unidade_minutos,
       vendedor_whatsapp_por_unidade, vendedor_whatsapp_padrao,
       palavras_reclamacao, palavras_pedido_humano, palavras_pedido_contrato,
       tentativas_sem_classificacao_limite, atualizado_em, atualizado_por
     ) VALUES (
       true, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13::jsonb, $14, $15, $16, $17, $18, now(), $19
     )
     ON CONFLICT (id) DO UPDATE SET
       followup_2h_minutos = EXCLUDED.followup_2h_minutos,
       followup_48h_minutos = EXCLUDED.followup_48h_minutos,
       followup_7d_minutos = EXCLUDED.followup_7d_minutos,
       followup_30d_minutos = EXCLUDED.followup_30d_minutos,
       reagendamento_fora_horario_minutos = EXCLUDED.reagendamento_fora_horario_minutos,
       hora_abertura = EXCLUDED.hora_abertura,
       hora_fechamento = EXCLUDED.hora_fechamento,
       atende_sabado = EXCLUDED.atende_sabado,
       atende_domingo = EXCLUDED.atende_domingo,
       sla_minutos = EXCLUDED.sla_minutos,
       sla_corporativo_minutos = EXCLUDED.sla_corporativo_minutos,
       sla_sem_unidade_minutos = EXCLUDED.sla_sem_unidade_minutos,
       vendedor_whatsapp_por_unidade = EXCLUDED.vendedor_whatsapp_por_unidade,
       vendedor_whatsapp_padrao = EXCLUDED.vendedor_whatsapp_padrao,
       palavras_reclamacao = EXCLUDED.palavras_reclamacao,
       palavras_pedido_humano = EXCLUDED.palavras_pedido_humano,
       palavras_pedido_contrato = EXCLUDED.palavras_pedido_contrato,
       tentativas_sem_classificacao_limite = EXCLUDED.tentativas_sem_classificacao_limite,
       atualizado_em = now(),
       atualizado_por = EXCLUDED.atualizado_por
     RETURNING *, NULL::text AS atualizado_por_nome`,
    [
      dados.followUpMinutos["2h"],
      dados.followUpMinutos["48h"],
      dados.followUpMinutos["7d"],
      dados.followUpMinutos["30d"],
      dados.reagendamentoForaHorarioMinutos,
      dados.horario.horaAbertura,
      dados.horario.horaFechamento,
      dados.horario.atendeSabado,
      dados.horario.atendeDomingo,
      JSON.stringify(dados.sla.porUnidade),
      dados.sla.corporativo,
      dados.sla.semUnidade,
      JSON.stringify(dados.vendedor.porUnidade),
      dados.vendedor.padrao,
      dados.handoff.palavrasReclamacao,
      dados.handoff.palavrasPedidoHumano,
      dados.handoff.palavrasPedidoContrato,
      dados.handoff.tentativasSemClassificacaoLimite,
      usuarioId,
    ]
  );
  return daLinha(r.rows[0]!);
}
