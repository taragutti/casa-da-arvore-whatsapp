import cron from "node-cron";
import { logger } from "../config/logger";
import {
  buscarAniversariosCasamento,
  buscarProspeccaoCorporativa,
  buscarLeadsFriosParaArquivar,
  buscarAniversariosDeCrianca,
  buscarCriancasFazendo14Anos,
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
  // Estes dois ainda NÃO existem na Meta — precisam ser submetidos com o corpo
  // idêntico às mensagens abaixo. Até lá o envio cai em texto livre, que só
  // entrega se o cliente tiver escrito nas últimas 24h; como estas réguas
  // disparam meses ou anos depois, na prática não entregam.
  aniversarioCrianca: "aniversario_crianca",
  convite15Anos: "convite_15_anos",
} as const;

// Textos autorais — a Seção 6 define os gatilhos de ciclo de vida (cross-sell),
// não o texto exato das mensagens. Revisar antes de confiar em produção.
// Precisam ser idênticos ao corpo dos templates acima quando eles existirem.
const MENSAGEM_ANIVERSARIO_CASAMENTO =
  "Parabéns pelo seu 1º aniversário de casamento! 🎉 Que tal comemorar essa data especial com um evento no Casarão? Ficamos à disposição pra planejar algo inesquecível com vocês. 🌳";

const MENSAGEM_PROSPECCAO_CORPORATIVA =
  "Faz um ano do evento da sua empresa com a gente! Ficamos à disposição caso estejam planejando um novo evento — convenção, confraternização ou treinamento. Vamos conversar? 🌳";

// Sem variável de propósito: template com variável exige aprovação do formato
// com exemplo, e o nome da criança nem sempre foi extraído. Uma felicitação
// que erra o nome é pior do que uma sem nome.
const MENSAGEM_ANIVERSARIO_CRIANCA =
  "Oi! Chegou a semana de aniversário aí na sua casa 🎉 Se quiser comemorar com a gente, temos datas disponíveis e condições especiais para quem já nos conhece. Quer que eu veja as opções para você?";

const MENSAGEM_CONVITE_15_ANOS =
  "Oi! Lembramos que está chegando a idade da festa de 15 anos 🎉 Nosso Casarão é referência em debutantes em Cabo Frio — se vocês já estiverem começando a planejar, é só responder que eu mando as fotos e as datas disponíveis. 🌳";

const MENSAGEM_ULTIMA_CAMPANHA =
  "Faz um tempo que não conversamos! Se ainda tiver interesse em realizar seu evento com a gente, é só responder essa mensagem que retomamos a conversa com todo prazer. 🌳";

/**
 * Régua de ciclo de vida / cross-sell (Seção 6), disparada por evento e não
 * por tempo parado: 1º aniversário de casamento, prospecção corporativa 1
 * ano após o evento, e arquivamento de leads frios há 12 meses.
 *
 * Cobre os cinco gatilhos da Seção 6: aniversário da criança (1 semana
 * antes), criança completando 14 anos, 1º aniversário de casamento,
 * prospecção corporativa 1 ano após o evento, e arquivamento de leads frios.
 *
 * Os dois primeiros dependem de `data_aniversario_crianca`, coletada no ramo
 * de recreação avulsa — sem essa data o lead simplesmente não entra na régua,
 * que é melhor do que estimar aniversário a partir da idade informada.
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

  const aniversariosCrianca = await buscarAniversariosDeCrianca();
  for (const lead of aniversariosCrianca) {
    try {
      await enviarComTemplateOuTexto({
        to: lead.whatsapp_number,
        templateName: TEMPLATES_CICLO_DE_VIDA.aniversarioCrianca,
        variaveis: [],
        textoFallback: MENSAGEM_ANIVERSARIO_CRIANCA,
        contexto: { leadId: lead.id, regua: "aniversario_crianca" },
      });
    } catch (error) {
      log.error({ err: error, leadId: lead.id }, "falha ao enviar felicitação de aniversário da criança");
    }
    // Tag por ano: a régua se repete todo aniversário, diferente das demais.
    await adicionarTag(lead.id, `aniversario_crianca_${new Date().getFullYear()}`);
    log.info({ leadId: lead.id }, "felicitação de aniversário da criança processada");
  }

  const criancas14Anos = await buscarCriancasFazendo14Anos();
  for (const lead of criancas14Anos) {
    try {
      await enviarComTemplateOuTexto({
        to: lead.whatsapp_number,
        templateName: TEMPLATES_CICLO_DE_VIDA.convite15Anos,
        variaveis: [],
        textoFallback: MENSAGEM_CONVITE_15_ANOS,
        contexto: { leadId: lead.id, regua: "convite_15_anos" },
      });
    } catch (error) {
      log.error({ err: error, leadId: lead.id }, "falha ao enviar convite de 15 anos");
    }
    await adicionarTag(lead.id, "convite_15_anos_enviado");
    log.info({ leadId: lead.id }, "convite de 15 anos (criança fez 14) processado");
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
      aniversariosCrianca: aniversariosCrianca.length,
      criancas14Anos: criancas14Anos.length,
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
