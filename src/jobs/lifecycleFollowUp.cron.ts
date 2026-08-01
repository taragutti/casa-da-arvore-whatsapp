import cron from "node-cron";
import { logger } from "../config/logger";
import {
  buscarAniversariosCasamento,
  buscarProspeccaoCorporativa,
  buscarLeadsFriosParaArquivar,
  arquivarLeadFrio,
  adicionarTag,
} from "../repositories/leads.repo";
import { enviarComTemplateOuTexto } from "../services/whatsapp.service";

/**
 * Templates de ciclo de vida. Todos APROVADOS e ativos na Meta desde
 * 31/07/2026 — antes disso caíam no fallback de texto livre, que exige o
 * cliente ter escrito nas últimas 24h e portanto praticamente nunca entregava
 * (estas réguas disparam 1 ano após o evento).
 *
 * Os textos abaixo precisam continuar IDÊNTICOS ao corpo aprovado na Meta:
 * eles são o fallback, e divergir faz o cliente receber uma redação diferente
 * da revisada dependendo de a janela de 24h estar aberta ou não.
 */
const TEMPLATES_CICLO_DE_VIDA = {
  aniversarioCasamento: "aniversario_casamento",
  prospeccaoCorporativa: "prospeccao_corporativa",
  ultimaCampanha: "ultima_campanha",
} as const;

// Textos autorais — a Seção 6 define os gatilhos de ciclo de vida (cross-sell),
// não o texto exato das mensagens. Revisar antes de confiar em produção.
// Precisam ser idênticos ao corpo dos templates acima quando eles existirem.
const MENSAGEM_ANIVERSARIO_CASAMENTO =
  "Parabéns pelo seu 1º aniversário de casamento! 🎉 Que tal comemorar essa data especial com um evento no Casarão? Ficamos à disposição pra planejar algo inesquecível com vocês. 🌳";

const MENSAGEM_PROSPECCAO_CORPORATIVA =
  "Faz um ano do evento da sua empresa com a gente! Ficamos à disposição caso estejam planejando um novo evento — convenção, confraternização ou treinamento. Vamos conversar? 🌳";

const MENSAGEM_ULTIMA_CAMPANHA =
  "Faz um tempo que não conversamos! Se ainda tiver interesse em realizar seu evento com a gente, é só responder essa mensagem que retomamos a conversa com todo prazer. 🌳";

/**
 * Régua de ciclo de vida / cross-sell (Seção 6), disparada por evento e não
 * por tempo parado: 1º aniversário de casamento, prospecção corporativa 1
 * ano após o evento, e arquivamento de leads frios há 12 meses.
 *
 * Fora do escopo desta implementação, sinalizado aqui de propósito:
 * "aniversário do cliente/criança (1 semana antes)" e "criança completando
 * 14 anos" não foram implementados — exigem data de nascimento, e o schema
 * (Seção 2 da especificação) só coleta idade no momento do evento, não data
 * de nascimento. Adicionar esse campo seria inventar um dado não pedido.
 */
export async function runLifecycleFollowUpJob(): Promise<void> {
  const log = logger.child({ job: "lifecycle-follow-up" });

  const aniversariosCasamento = await buscarAniversariosCasamento();
  for (const lead of aniversariosCasamento) {
    try {
      await enviarComTemplateOuTexto({
        to: lead.whatsapp_number,
        templateName: TEMPLATES_CICLO_DE_VIDA.aniversarioCasamento,
        variaveis: [],
        textoFallback: MENSAGEM_ANIVERSARIO_CASAMENTO,
        contexto: { leadId: lead.id, regua: "aniversario_casamento" },
      });
    } catch (error) {
      log.error({ err: error, leadId: lead.id }, "falha ao enviar follow-up de aniversário de casamento");
    }
    await adicionarTag(lead.id, "aniversario_casamento_enviado");
    log.info({ leadId: lead.id }, "follow-up de 1º aniversário de casamento processado");
  }

  const prospeccoesCorporativas = await buscarProspeccaoCorporativa();
  for (const lead of prospeccoesCorporativas) {
    try {
      await enviarComTemplateOuTexto({
        to: lead.whatsapp_number,
        templateName: TEMPLATES_CICLO_DE_VIDA.prospeccaoCorporativa,
        variaveis: [],
        textoFallback: MENSAGEM_PROSPECCAO_CORPORATIVA,
        contexto: { leadId: lead.id, regua: "prospeccao_corporativa" },
      });
    } catch (error) {
      log.error({ err: error, leadId: lead.id }, "falha ao enviar follow-up de prospecção corporativa");
    }
    await adicionarTag(lead.id, "prospeccao_corporativa_enviada");
    log.info({ leadId: lead.id }, "follow-up de prospecção corporativa (1 ano) processado");
  }

  const leadsFrios = await buscarLeadsFriosParaArquivar();
  for (const lead of leadsFrios) {
    try {
      await enviarComTemplateOuTexto({
        to: lead.whatsapp_number,
        templateName: TEMPLATES_CICLO_DE_VIDA.ultimaCampanha,
        variaveis: [],
        textoFallback: MENSAGEM_ULTIMA_CAMPANHA,
        contexto: { leadId: lead.id, regua: "ultima_campanha" },
      });
    } catch (error) {
      log.error({ err: error, leadId: lead.id }, "falha ao enviar última campanha antes do arquivamento");
    }
    await adicionarTag(lead.id, "lead_frio_arquivado");
    await arquivarLeadFrio(lead.id);
    log.info({ leadId: lead.id }, "lead frio arquivado (12 meses sem interação)");
  }

  log.info(
    {
      aniversariosCasamento: aniversariosCasamento.length,
      prospeccoesCorporativas: prospeccoesCorporativas.length,
      leadsFrios: leadsFrios.length,
    },
    "job de ciclo de vida (cross-sell) concluído"
  );
}

/** Agenda o job pra rodar todo dia às 08:00, horário de Brasília. Chamar uma vez na subida do servidor. */
export function scheduleLifecycleFollowUpJob(): void {
  cron.schedule(
    "0 8 * * *",
    () => {
      runLifecycleFollowUpJob().catch((error) => {
        logger.error({ err: error }, "falha ao rodar o job de ciclo de vida agendado");
      });
    },
    { timezone: "America/Sao_Paulo" }
  );
  logger.info("job de ciclo de vida (cross-sell) agendado (todo dia às 08:00, horário de Brasília)");
}
