import { z } from "zod";
import { UNIDADES } from "./leadsApi.schemas";
import { REGRAS_SLA_PADRAO, REGRAS_VENDEDOR_PADRAO } from "../services/handoff.service";
import { telefoneWhatsapp } from "../utils/telefone";

/**
 * Limites de sanidade, não burocracia: cada um evita uma configuração que
 * quebraria a operação de um jeito difícil de diagnosticar depois.
 */
const MINUTO_MIN = 1;
const MINUTO_MAX = 525_600; // 1 ano — acima disso o job na fila perde sentido prático

const minutos = (rotulo: string) =>
  z
    .number({ message: `${rotulo}: informe um número de minutos` })
    .int(`${rotulo}: use minutos inteiros`)
    .min(MINUTO_MIN, `${rotulo}: mínimo de ${MINUTO_MIN} minuto`)
    .max(MINUTO_MAX, `${rotulo}: máximo de 1 ano`);

/**
 * Lista de palavras-gatilho. Normaliza em minúsculas e sem espaço nas pontas
 * porque a comparação no handoff é por substring em minúsculas — termo salvo
 * com maiúscula ou espaço sobrando simplesmente nunca casaria, e a tela não
 * teria como avisar que a palavra "não funciona".
 */
const palavras = (rotulo: string) =>
  z
    .array(z.string())
    .transform((lista) =>
      Array.from(
        new Set(
          lista
            .map((t) => t.trim().toLowerCase())
            .filter((t) => t.length > 0)
        )
      )
    )
    .refine((lista) => lista.length > 0, `${rotulo}: deixe ao menos uma palavra`)
    .refine((lista) => lista.every((t) => t.length >= 3), `${rotulo}: termos de 1–2 letras casariam com quase tudo`)
    .refine((lista) => lista.length <= 200, `${rotulo}: máximo de 200 termos`);

export const configSchema = z
  .object({
    followUpMinutos: z.object({
      "2h": minutos("Régua 1"),
      "48h": minutos("Régua 2"),
      "7d": minutos("Régua 3"),
      "30d": minutos("Régua 4"),
    }),
    reagendamentoForaHorarioMinutos: minutos("Reagendamento fora do horário"),
    horario: z.object({
      horaAbertura: z.number().int().min(0).max(23),
      horaFechamento: z.number().int().min(1).max(24),
      atendeSabado: z.boolean(),
      atendeDomingo: z.boolean(),
    }),
    sla: z.object({
      /**
       * `z.record` produz chaves OPCIONAIS, então completar com os padrões faz
       * duas coisas: satisfaz o tipo (sem isso o SLA de uma unidade poderia ser
       * `undefined` e o e-mail ao vendedor mostraria "NaN min"), e torna a API
       * tolerante a payload parcial — útil quando uma unidade nova é adicionada
       * no código antes de a tela ser recarregada.
       */
      porUnidade: z
        .record(z.enum(UNIDADES), minutos("SLA da unidade"))
        .transform((parcial) => ({ ...REGRAS_SLA_PADRAO.porUnidade, ...parcial })),
      corporativo: minutos("SLA corporativo"),
      semUnidade: minutos("SLA sem unidade"),
    }),
    vendedor: z.object({
      // Mesma tolerância a payload parcial que o SLA já tem: unidade nova
      // adicionada no código antes de a tela recarregar não vira `undefined`.
      porUnidade: z
        .record(z.enum(UNIDADES), telefoneWhatsapp("Vendedor da unidade"))
        .transform((parcial) => ({ ...REGRAS_VENDEDOR_PADRAO.porUnidade, ...parcial })),
      padrao: telefoneWhatsapp("Vendedor padrão (unidade indefinida)"),
    }),
    handoff: z.object({
      palavrasReclamacao: palavras("Palavras de reclamação"),
      palavrasPedidoHumano: palavras("Pedido de atendimento humano"),
      palavrasPedidoContrato: palavras("Pedido de contrato"),
      tentativasSemClassificacaoLimite: z
        .number()
        .int()
        .min(1, "Limite de tentativas: mínimo 1")
        .max(10, "Limite de tentativas: máximo 10"),
    }),
    avisoOciosidadeVendedorMinutos: minutos("Aviso de ociosidade do vendedor"),
    resumoDiarioVendedor: z.object({
      ativo: z.boolean(),
      hora: z.number().int().min(0, "Horário do resumo: mínimo 0h").max(23, "Horário do resumo: máximo 23h"),
    }),
  })
  .refine((c) => c.horario.horaFechamento > c.horario.horaAbertura, {
    message: "Horário: o fechamento tem que ser depois da abertura",
    path: ["horario", "horaFechamento"],
  })
  /**
   * A régua tem que ser crescente. Sem isso, configurar a régua 2 com prazo
   * MENOR que a régua 1 faria o lead receber o follow-up de 48h antes do de 2h —
   * a sequência de nutrição sairia embaralhada, e o sintoma (mensagens fora de
   * ordem dias depois) seria muito difícil de ligar de volta a esta tela.
   */
  .refine(
    (c) =>
      c.followUpMinutos["2h"] < c.followUpMinutos["48h"] &&
      c.followUpMinutos["48h"] < c.followUpMinutos["7d"] &&
      c.followUpMinutos["7d"] < c.followUpMinutos["30d"],
    { message: "As réguas precisam ser crescentes: cada uma maior que a anterior", path: ["followUpMinutos"] }
  );

export type ConfigEntrada = z.infer<typeof configSchema>;
