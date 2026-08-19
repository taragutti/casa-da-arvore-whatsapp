import cron from "node-cron";
import { logger } from "../config/logger";
import { obterConfig } from "../services/config.service";
import { listarUsuariosComUnidades } from "../repositories/usuarios.repo";
import { buscarLeadsAtivosPorUnidades, LeadResumoDiario } from "../repositories/leads.repo";
import { sendWhatsAppMessage } from "../services/whatsapp.service";
import { montarResumoDiarioParaVendedor } from "../services/vendorDailyDigest.service";
import { UnidadeRecomendada } from "../services/routing.service";

/**
 * Hora atual (0-23) e se hoje é domingo, no fuso America/Sao_Paulo — mesma
 * técnica de `dentroDoHorarioComercial()` em handoff.service.ts, reaproveitada
 * aqui porque o horário de disparo do resumo também é configurável no painel.
 */
function horarioAtualSaoPaulo(agora: Date): { hora: number; domingo: boolean } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(agora);

  const hora = Number(partes.find((p) => p.type === "hour")?.value);
  const domingo = (partes.find((p) => p.type === "weekday")?.value ?? "") === "Sun";
  return { hora, domingo };
}

/**
 * Resumo diário de leads ativos por vendedor (estágio 9): diferente da
 * notificação de handoff (que vai para um número compartilhado por unidade),
 * este vai para o celular PESSOAL de cada usuário com telefone cadastrado,
 * listando só os leads das unidades que ele atende.
 *
 * O cron roda de hora em hora (ver `scheduleVendorDailyDigestJob`); é este
 * job que decide, a cada chamada, se É a hora configurada no painel — assim
 * o horário muda em runtime sem precisar reagendar o cron.
 */
export async function runVendorDailyDigestJob(agora: Date = new Date()): Promise<void> {
  const log = logger.child({ job: "vendor-daily-digest" });
  const config = await obterConfig();

  if (!config.resumoDiarioVendedor.ativo) return;

  const { hora, domingo } = horarioAtualSaoPaulo(agora);
  if (domingo || hora !== config.resumoDiarioVendedor.hora) return;

  const usuarios = await listarUsuariosComUnidades();
  const vendedores = usuarios.filter((u) => u.ativo && u.telefone && u.unidades.length > 0);

  let enviados = 0;
  for (const vendedor of vendedores) {
    try {
      const leadsPorUnidade = new Map<UnidadeRecomendada, LeadResumoDiario[]>();
      for (const unidade of vendedor.unidades) {
        leadsPorUnidade.set(unidade, await buscarLeadsAtivosPorUnidades([unidade]));
      }

      const mensagem = montarResumoDiarioParaVendedor(leadsPorUnidade);
      if (!mensagem) continue;

      await sendWhatsAppMessage(vendedor.telefone!, mensagem);
      enviados++;
    } catch (error) {
      log.error({ err: error, usuarioId: vendedor.id }, "falha ao enviar resumo diário para vendedor");
    }
  }

  log.info({ vendedoresElegiveis: vendedores.length, enviados }, "resumo diário de leads por vendedor concluído");
}

/** Roda a cada hora cheia; o próprio job decide se é a hora configurada no painel (ver runVendorDailyDigestJob). */
export function scheduleVendorDailyDigestJob(): void {
  cron.schedule(
    "0 * * * *",
    () => {
      runVendorDailyDigestJob().catch((error) => {
        logger.error({ err: error }, "falha ao rodar o job de resumo diário do vendedor");
      });
    },
    { timezone: "America/Sao_Paulo" }
  );
  logger.info("job de resumo diário de leads por vendedor agendado (checa a cada hora, horário de Brasília)");
}
