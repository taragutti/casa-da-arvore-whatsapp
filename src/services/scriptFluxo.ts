/**
 * O grafo de nós do script de atendimento (Script_Bot_Atendimento.docx).
 *
 * Este arquivo é DADO, não lógica: transcreve as mensagens exatas e as opções
 * de cada nó do documento. Quem decide o que fazer com isso é o
 * scriptEngine.service. A separação é proposital — a copy muda com frequência
 * (é editorial, vem da gestão), e a decisão de fluxo não deveria ser
 * recompilada junto com um ajuste de emoji.
 *
 * Convenção de interpolação:
 * - `{{campo}}` é substituído pelo valor coletado (ou extraído pela IA).
 * - `[[trecho com {{campo}}]]` é um trecho OPCIONAL: some inteiro quando o
 *   campo não tem valor. Sem isso, "Que fofo, {{nome}}!" viraria "Que fofo, !"
 *   toda vez que a extração não achasse o nome — que é o caso comum quando o
 *   cliente responde "vai fazer 6 aninhos" sem dizer o nome.
 */

import { UnidadeRecomendada } from "./routing.service";
import { GatilhoHandoff } from "./handoff.service";

export type IdNo = string;

/** Opção de menu numerado. `valor` é o que fica gravado em dados_coletados. */
export interface OpcaoMenu {
  numero: number;
  rotulo: string;
  valor: string;
  /**
   * Termos livres que também contam como esta escolha. O documento pede menu
   * numerado, mas cliente de WhatsApp responde "até 50" ou "vista pro mar" com
   * a mesma frequência com que digita "1" — recusar isso viraria fallback e,
   * duas vezes seguidas, handoff desnecessário.
   */
  sinonimos?: string[];
  /** Salto específico desta opção; quando ausente, usa o `proximo` do nó. */
  proximo?: IdNo;
}

interface NoBase {
  id: IdNo;
  /** Mensagens enviadas em sequência — o documento pede blocos curtos, não um texto longo. */
  mensagens: string[];
  proximo?: IdNo;
}

export type No =
  /** Só fala e segue adiante, sem esperar resposta. */
  | (NoBase & { tipo: "mensagem" })
  /** Pergunta aberta: grava a resposta crua no campo e segue. */
  | (NoBase & { tipo: "pergunta_texto"; campo: string })
  /** Pergunta de menu: só avança com uma opção válida. */
  | (NoBase & { tipo: "pergunta_menu"; campo: string; opcoes: OpcaoMenu[] })
  /** Aplica a tabela de roteamento do ramo e salta para o nó de apresentação. */
  | (NoBase & { tipo: "roteamento"; ramo: "infantil" | "casamento" })
  /** Envia catálogo/fotos/vídeo da unidade já decidida. */
  | (NoBase & { tipo: "material"; unidade: UnidadeRecomendada })
  /** Consulta a agenda da unidade para a data informada (N8A). */
  | (NoBase & { tipo: "agenda" })
  /** Encerra o fluxo do bot e entrega ao consultor humano. */
  | (NoBase & { tipo: "handoff"; motivo: GatilhoHandoff })
  /** Oferta de cupom do ramo de recreação avulsa (N4E). */
  | (NoBase & { tipo: "cupom"; campo: string; opcoes: OpcaoMenu[] });

// ---------------------------------------------------------------------------
// Parte 3 — Nó de entrada
// ---------------------------------------------------------------------------

/**
 * N0 tem duas versões no documento (dentro e fora do horário comercial). Elas
 * vivem aqui como nós distintos e quem escolhe é o motor, consultando
 * dentroDoHorarioComercial() — a mesma função que o handoff já usa, para os
 * dois não divergirem.
 */
export const N0_COMERCIAL: No = {
  id: "N0_COMERCIAL",
  tipo: "mensagem",
  mensagens: [
    "Olá! 🎉 Tudo bem?",
    "Aqui é a central de atendimento do nosso grupo de casas de festas em Cabo Frio.",
    "Para agilizar seu atendimento, me conta rapidinho: qual é o tipo de evento que você está planejando?",
  ],
  proximo: "N1",
};

export const N0_FORA_HORARIO: No = {
  id: "N0_FORA_HORARIO",
  tipo: "mensagem",
  mensagens: [
    "Olá! 🎉 Que bom ter você aqui!",
    "Nosso atendimento humano funciona de segunda a sábado, das 9h às 20h — mas fica tranquilo, posso adiantar tudo com você agora e um consultor entra em contato assim que abrirmos.",
    "Para começar, me conta: qual é o tipo de evento que você está planejando?",
  ],
  proximo: "N1",
};

const N1: No = {
  id: "N1",
  tipo: "pergunta_menu",
  campo: "ramo_escolhido",
  mensagens: [
    "Escolha uma das opções abaixo:\n\n1️⃣ Festa infantil (aniversário)\n2️⃣ Festa de 15 anos\n3️⃣ Casamento\n4️⃣ Evento corporativo\n5️⃣ Recreação para meus filhos no shopping\n6️⃣ Outro tipo de evento",
  ],
  opcoes: [
    {
      numero: 1,
      rotulo: "Festa infantil (aniversário)",
      valor: "infantil",
      sinonimos: ["infantil", "aniversário", "aniversario", "festa infantil", "criança", "crianca", "filho", "filha"],
      proximo: "N2A",
    },
    {
      numero: 2,
      rotulo: "Festa de 15 anos",
      valor: "15_anos",
      sinonimos: ["15 anos", "quinze anos", "debutante", "15", "aniversário de 15"],
      proximo: "N2B",
    },
    {
      numero: 3,
      rotulo: "Casamento",
      valor: "casamento",
      sinonimos: ["casamento", "casar", "noivos", "noiva", "noivo", "bodas"],
      proximo: "N2C",
    },
    {
      numero: 4,
      rotulo: "Evento corporativo",
      valor: "corporativo",
      sinonimos: ["corporativo", "empresa", "convenção", "convencao", "confraternização", "confraternizacao", "treinamento"],
      proximo: "N2D",
    },
    {
      numero: 5,
      rotulo: "Recreação para meus filhos no shopping",
      valor: "recreacao_avulsa",
      sinonimos: ["recreação", "recreacao", "shopping", "brinquedos", "monitores"],
      proximo: "N2E",
    },
    {
      numero: 6,
      rotulo: "Outro tipo de evento",
      valor: "outro",
      sinonimos: ["outro", "outra coisa", "diferente"],
      proximo: "N2F",
    },
  ],
};

// ---------------------------------------------------------------------------
// Parte 4 — Ramo A: Festa Infantil
// ---------------------------------------------------------------------------

const N2A: No = {
  id: "N2A",
  tipo: "pergunta_texto",
  campo: "resposta_nome_idade",
  mensagens: [
    "Que legal! Aniversário é sempre um momento especial ❤️",
    "Para começar, me conta o nome e a idade que o(a) aniversariante vai fazer?",
  ],
  proximo: "N3A",
};

const N3A: No = {
  id: "N3A",
  tipo: "pergunta_texto",
  campo: "resposta_data",
  mensagens: ["Que fofo[[, {{nome_aniversariante}}]]! 🎂", "Você já tem uma data em mente para a festa?"],
  proximo: "N4A",
};

/**
 * Faixas viram número representativo porque o roteamento (routing.service) já
 * decide por número e é testado assim. O valor escolhido em cada faixa é o que
 * cai do lado certo dos limiares do documento — ex.: "De 50 a 100" vira 100,
 * que é exatamente a fronteira onde a regra passa a olhar o investimento.
 */
const N4A: No = {
  id: "N4A",
  tipo: "pergunta_menu",
  campo: "faixa_convidados",
  mensagens: [
    "Perfeito!",
    "E me diz, quantos convidados você imagina no total (adultos + crianças)?\n\n1️⃣ Até 50 convidados\n2️⃣ De 50 a 100 convidados\n3️⃣ De 100 a 200 convidados\n4️⃣ Mais de 200 convidados",
  ],
  opcoes: [
    { numero: 1, rotulo: "Até 50 convidados", valor: "ate_50", sinonimos: ["até 50", "ate 50", "menos de 50"] },
    { numero: 2, rotulo: "De 50 a 100 convidados", valor: "50_100", sinonimos: ["50 a 100", "entre 50 e 100"] },
    { numero: 3, rotulo: "De 100 a 200 convidados", valor: "100_200", sinonimos: ["100 a 200", "entre 100 e 200"] },
    { numero: 4, rotulo: "Mais de 200 convidados", valor: "mais_200", sinonimos: ["mais de 200", "acima de 200"] },
  ],
  proximo: "N5A",
};

const N5A: No = {
  id: "N5A",
  tipo: "pergunta_menu",
  campo: "faixa_investimento",
  mensagens: [
    "Só mais uma pergunta para eu te mostrar as melhores opções:",
    "Você já tem uma ideia de investimento para a festa? (Pode ser uma faixa aproximada, é só para eu te enviar as opções mais adequadas)\n\n1️⃣ Até R$ 10 mil\n2️⃣ De R$ 10 mil a R$ 20 mil\n3️⃣ De R$ 20 mil a R$ 40 mil\n4️⃣ Acima de R$ 40 mil\n5️⃣ Prefiro conversar com um consultor",
  ],
  opcoes: [
    { numero: 1, rotulo: "Até R$ 10 mil", valor: "ate_10k", sinonimos: ["até 10", "ate 10", "10 mil"] },
    { numero: 2, rotulo: "De R$ 10 mil a R$ 20 mil", valor: "10k_20k", sinonimos: ["10 a 20", "entre 10 e 20", "20 mil"] },
    { numero: 3, rotulo: "De R$ 20 mil a R$ 40 mil", valor: "20k_40k", sinonimos: ["20 a 40", "entre 20 e 40", "40 mil"] },
    { numero: 4, rotulo: "Acima de R$ 40 mil", valor: "acima_40k", sinonimos: ["acima de 40", "mais de 40"] },
    {
      numero: 5,
      rotulo: "Prefiro conversar com um consultor",
      valor: "prefere_consultor",
      sinonimos: ["prefiro falar", "com consultor", "não sei", "nao sei", "prefiro não dizer", "prefiro nao dizer"],
    },
  ],
  proximo: "N6A",
};

const N6A: No = {
  id: "N6A",
  tipo: "roteamento",
  ramo: "infantil",
  mensagens: [],
};

const N7A_ARVORE: No = {
  id: "N7A_ARVORE",
  tipo: "material",
  unidade: "casa_da_arvore",
  mensagens: [
    "Pelo que você me contou, a Casa da Árvore é o espaço ideal para vocês! ✨",
    "É a nossa unidade para festas de maior porte, com estrutura completa: mais de 150 temas de decoração, brinquedão, área baby, cozinha interativa, tirolesa, simulador de asa-delta, piscina e muito mais.",
    "Vou te enviar agora nosso catálogo e algumas fotos do espaço em uso real:",
  ],
  proximo: "N8A",
};

const N7A_PARK: No = {
  id: "N7A_PARK",
  tipo: "material",
  unidade: "park_lagos",
  mensagens: [
    "Pelo que você me contou, a Casa da Árvore Park Lagos é o espaço ideal para vocês! 🎈",
    "É a nossa unidade voltada para festas mais aconchegantes, com tudo o que sua criança precisa para uma comemoração linda e com um investimento mais acessível.",
    "Vou te enviar agora nosso catálogo com pacotes fechados e as fotos do espaço:",
  ],
  proximo: "N8A",
};

const N8A: No = {
  id: "N8A",
  tipo: "agenda",
  mensagens: [],
  proximo: "N9_HANDOFF",
};

// ---------------------------------------------------------------------------
// Parte 5 — Ramo B: 15 Anos (sempre Casarão)
// ---------------------------------------------------------------------------

const N2B: No = {
  id: "N2B",
  tipo: "pergunta_texto",
  campo: "resposta_nome_data",
  mensagens: [
    "Que momento especial! 15 anos é uma data única ✨",
    "Me conta: qual o nome da debutante e vocês já têm uma data em mente para a festa?",
  ],
  proximo: "N3B",
};

const N3B: No = {
  id: "N3B",
  tipo: "pergunta_menu",
  campo: "formato_festa",
  mensagens: [
    "Perfeito! E como vocês imaginam a festa[[ da {{nome_debutante}}]]?\n\n1️⃣ Baile tradicional (valsa, cerimonial, formatura)\n2️⃣ Festa moderna (mais próxima de balada, com pista de dança)\n3️⃣ Estilo intimista, só com família e amigos próximos\n4️⃣ Ainda não decidimos, quero conhecer as opções",
  ],
  opcoes: [
    { numero: 1, rotulo: "Baile tradicional", valor: "tradicional", sinonimos: ["tradicional", "baile", "valsa", "cerimonial"] },
    { numero: 2, rotulo: "Festa moderna", valor: "moderno", sinonimos: ["moderna", "moderno", "balada", "pista"] },
    { numero: 3, rotulo: "Estilo intimista", valor: "intimista", sinonimos: ["intimista", "íntima", "intima", "família", "familia"] },
    { numero: 4, rotulo: "Ainda não decidimos", valor: "nao_decidiu", sinonimos: ["não decidimos", "nao decidimos", "não sei", "nao sei", "conhecer as opções"] },
  ],
  proximo: "N4B",
};

const N4B: No = {
  id: "N4B",
  tipo: "pergunta_menu",
  campo: "faixa_convidados",
  mensagens: [
    "Ótimo!",
    "Quantos convidados vocês estão pensando em receber?\n\n1️⃣ Até 100\n2️⃣ De 100 a 200\n3️⃣ De 200 a 400\n4️⃣ Mais de 400",
  ],
  opcoes: [
    { numero: 1, rotulo: "Até 100", valor: "ate_100", sinonimos: ["até 100", "ate 100"] },
    { numero: 2, rotulo: "De 100 a 200", valor: "100_200", sinonimos: ["100 a 200"] },
    { numero: 3, rotulo: "De 200 a 400", valor: "200_400", sinonimos: ["200 a 400"] },
    { numero: 4, rotulo: "Mais de 400", valor: "mais_400", sinonimos: ["mais de 400", "acima de 400"] },
  ],
  proximo: "N5B",
};

const N5B: No = {
  id: "N5B",
  tipo: "material",
  unidade: "casarao",
  mensagens: [
    "O espaço perfeito para vocês é o Casarão — referência em festas de debutante em Cabo Frio ✨",
    "Ambiente climatizado, gramado de até 2 mil m², cobertura de cristal, iluminação especial e toda a estrutura para uma festa inesquecível.",
    "Vou te enviar nosso catálogo de 15 anos com pacotes e as fotos de festas recentes:",
  ],
  proximo: "N6B",
};

const N6B: No = {
  id: "N6B",
  tipo: "agenda",
  mensagens: [],
  proximo: "N9_HANDOFF",
};

// ---------------------------------------------------------------------------
// Parte 6 — Ramo C: Casamento
// ---------------------------------------------------------------------------

const N2C: No = {
  id: "N2C",
  tipo: "pergunta_texto",
  campo: "resposta_nomes_noivos",
  mensagens: [
    "Que notícia linda! ❤️",
    "Casamento é o dia mais importante da vida de um casal — e escolher o espaço certo faz toda a diferença.",
    "Me conta o nome de vocês dois?",
  ],
  proximo: "N3C",
};

const N3C: No = {
  id: "N3C",
  tipo: "pergunta_menu",
  campo: "origem_casal",
  mensagens: [
    "Prazer em conhecer vocês[[, {{nomes_noivos}}]]! 🥂",
    "Vocês são de Cabo Frio ou vêm de outra cidade para casar aqui?\n\n1️⃣ Somos de Cabo Frio\n2️⃣ Somos de outra cidade / estado (viemos casar em Cabo Frio)\n3️⃣ Somos de outro país",
  ],
  opcoes: [
    { numero: 1, rotulo: "Somos de Cabo Frio", valor: "cabo_frio", sinonimos: ["cabo frio", "daqui", "somos daqui"] },
    { numero: 2, rotulo: "Somos de outra cidade / estado", valor: "outra_cidade", sinonimos: ["outra cidade", "outro estado", "de fora"] },
    { numero: 3, rotulo: "Somos de outro país", valor: "exterior", sinonimos: ["outro país", "outro pais", "exterior", "fora do brasil"] },
  ],
  proximo: "N4C",
};

const N4C: No = {
  id: "N4C",
  tipo: "pergunta_menu",
  campo: "preferencia_espaco",
  mensagens: [
    "Legal!",
    "E me conta uma coisa importante: vocês sonham com um casamento com vista para o mar, ou preferem um espaço mais reservado e climatizado?\n\n1️⃣ Com vista para o mar / na praia\n2️⃣ Espaço reservado e climatizado\n3️⃣ Estamos abertos, quero conhecer as duas opções",
  ],
  opcoes: [
    { numero: 1, rotulo: "Com vista para o mar / na praia", valor: "vista_mar", sinonimos: ["vista mar", "vista pro mar", "praia", "mar"] },
    { numero: 2, rotulo: "Espaço reservado e climatizado", valor: "climatizado", sinonimos: ["climatizado", "reservado", "fechado", "ar condicionado"] },
    { numero: 3, rotulo: "Estamos abertos às duas opções", valor: "aberto_as_duas", sinonimos: ["abertos", "as duas", "tanto faz", "conhecer as duas"] },
  ],
  proximo: "N5C",
};

const N5C: No = {
  id: "N5C",
  tipo: "pergunta_texto",
  campo: "resposta_data",
  mensagens: ["Perfeito!", "Vocês já têm uma data em mente?"],
  proximo: "N6C",
};

/**
 * A Casa Pôr do Sol comporta até 150 pessoas. Por isso as faixas aqui quebram
 * exatamente em 150 — acima disso, mesmo com preferência por vista para o mar,
 * o documento manda ir para o Casarão.
 */
const N6C: No = {
  id: "N6C",
  tipo: "pergunta_menu",
  campo: "faixa_convidados",
  mensagens: [
    "E quantos convidados vocês esperam receber?\n\n1️⃣ Até 50\n2️⃣ De 50 a 100\n3️⃣ De 100 a 150\n4️⃣ De 150 a 250\n5️⃣ Mais de 250",
  ],
  opcoes: [
    { numero: 1, rotulo: "Até 50", valor: "ate_50", sinonimos: ["até 50", "ate 50"] },
    { numero: 2, rotulo: "De 50 a 100", valor: "50_100", sinonimos: ["50 a 100"] },
    { numero: 3, rotulo: "De 100 a 150", valor: "100_150", sinonimos: ["100 a 150"] },
    { numero: 4, rotulo: "De 150 a 250", valor: "150_250", sinonimos: ["150 a 250"] },
    { numero: 5, rotulo: "Mais de 250", valor: "mais_250", sinonimos: ["mais de 250", "acima de 250"] },
  ],
  proximo: "N7C",
};

/**
 * N7C é condicional no documento: só perguntar se o casal é de fora OU quer
 * vista para o mar. O motor pula o nó quando a condição não vale — a condição
 * mora no engine (scriptEngine.service), junto com o resto da lógica.
 */
const N7C: No = {
  id: "N7C",
  tipo: "pergunta_menu",
  campo: "interesse_hospedagem",
  mensagens: [
    "Última pergunta e já te mostro as opções!",
    "Vocês têm interesse em uma parceria de hospedagem para o casal e/ou convidados durante o evento?\n\n1️⃣ Sim, queremos algo integrado\n2️⃣ Já temos hospedagem definida\n3️⃣ Ainda não pensamos nisso",
  ],
  opcoes: [
    { numero: 1, rotulo: "Sim, queremos algo integrado", valor: "sim", sinonimos: ["sim", "queremos", "temos interesse"] },
    { numero: 2, rotulo: "Já temos hospedagem definida", valor: "ja_temos", sinonimos: ["já temos", "ja temos", "resolvido"] },
    { numero: 3, rotulo: "Ainda não pensamos nisso", valor: "nao_pensamos", sinonimos: ["não pensamos", "nao pensamos", "ainda não", "ainda nao"] },
  ],
  proximo: "N8C",
};

const N8C: No = {
  id: "N8C",
  tipo: "roteamento",
  ramo: "casamento",
  mensagens: [],
};

const N9C_POR_DO_SOL: No = {
  id: "N9C_POR_DO_SOL",
  tipo: "material",
  unidade: "casa_por_do_sol",
  mensagens: [
    "Vocês encontraram o espaço perfeito 🌅",
    "A Casa Pôr do Sol é a nossa unidade especializada em casamentos com vista para o mar — cenário exclusivo, com o pôr do sol mais bonito de Cabo Frio como pano de fundo da cerimônia.",
    "Recebemos muitos casais que vêm de outras cidades e de outros países para casar aqui — é um verdadeiro destination wedding brasileiro.",
    "Vou te enviar nosso material completo:",
  ],
  proximo: "N10C",
};

const N9C_CASARAO: No = {
  id: "N9C_CASARAO",
  tipo: "material",
  unidade: "casarao",
  mensagens: [
    "Vocês vão amar o Casarão ❤️",
    "Nosso espaço combina ambiente climatizado, elegância e uma ampla área externa com gramado — perfeito para casamentos que unem cerimônia e recepção em um só lugar, com toda a comodidade.",
    "Vou te enviar nosso catálogo de casamentos e as fotos:",
  ],
  proximo: "N10C",
};

const N10C: No = {
  id: "N10C",
  tipo: "agenda",
  mensagens: [],
  proximo: "N9_HANDOFF",
};

// ---------------------------------------------------------------------------
// Parte 7 — Ramo D: Corporativo (handoff imediato após a ficha técnica)
// ---------------------------------------------------------------------------

const N2D: No = {
  id: "N2D",
  tipo: "pergunta_texto",
  campo: "resposta_empresa",
  mensagens: [
    "Olá! Que bom receber vocês.",
    "Para preparar as melhores opções, me conta:\n\n1️⃣ Nome da empresa\n2️⃣ Seu nome e cargo\n3️⃣ Tipo de evento (convenção, confraternização, treinamento, lançamento, outro)",
  ],
  proximo: "N3D",
};

const N3D: No = {
  id: "N3D",
  tipo: "pergunta_texto",
  campo: "resposta_dimensionamento",
  mensagens: [
    "Perfeito! E para dimensionar corretamente:\n\n• Número aproximado de participantes?\n• Data ou período do evento?\n• O evento é de dia inteiro, meio período ou noturno?",
  ],
  proximo: "N4D",
};

const N4D: No = {
  id: "N4D",
  tipo: "pergunta_texto",
  campo: "necessidades_tecnicas",
  mensagens: [
    "Última pergunta e já te envio nossa proposta:",
    "O evento precisa de alguma estrutura específica? (Pode marcar mais de uma)\n\n1️⃣ Palco / auditório\n2️⃣ Estrutura audiovisual (som, telão, microfones)\n3️⃣ Estacionamento amplo\n4️⃣ Wi-Fi de alta velocidade\n5️⃣ Coffee break / almoço / jantar\n6️⃣ Salas de apoio para reuniões paralelas",
  ],
  proximo: "N5D",
};

const N5D: No = {
  id: "N5D",
  tipo: "material",
  unidade: "casarao",
  mensagens: [
    "Ótimo, tenho tudo o que preciso.",
    "Nosso espaço para eventos corporativos é o Casarão: 2 mil m² de gramado, área climatizada, cobertura de cristal, estacionamento próprio e toda infraestrutura audiovisual sob demanda.",
    "Vou te enviar a ficha técnica completa e o portfólio de eventos corporativos que já realizamos:",
  ],
  proximo: "N6D",
};

const N6D: No = {
  id: "N6D",
  tipo: "handoff",
  motivo: "corporativo_ficha_tecnica",
  mensagens: [
    "Um consultor especializado em eventos corporativos vai te chamar em instantes para preparar uma proposta personalizada. Tudo bem?",
  ],
};

// ---------------------------------------------------------------------------
// Parte 8 — Ramo E: Recreação avulsa (Shopping Park Lagos)
// ---------------------------------------------------------------------------

const N2E: No = {
  id: "N2E",
  tipo: "mensagem",
  mensagens: [
    "Que legal! 🎠",
    "No Shopping Park Lagos você encontra recreação infantil segura, com monitores experientes e brinquedos para todas as idades.",
    "Nossos horários:\n• Segunda a sábado: 10h às 22h\n• Domingo: 12h às 21h",
    "Fica no Shopping Park Lagos, em Cabo Frio (Henrique Terra, 1700 — Palmeiras).",
  ],
  proximo: "N3E",
};

const N3E: No = {
  id: "N3E",
  tipo: "pergunta_texto",
  campo: "resposta_idade_crianca",
  mensagens: [
    "Posso te fazer uma pergunta rapidinha?",
    "Qual a idade do(a) seu(sua) filho(a)? Assim consigo te dar dicas melhores dos brinquedos e também te avisar sobre promoções e eventos temáticos que combinam com a faixa etária dele(a).",
  ],
  proximo: "N4E",
};

const N4E: No = {
  id: "N4E",
  tipo: "cupom",
  campo: "cupom_aceito",
  mensagens: [
    "Ótimo! Última pergunta:",
    "Você já pensou em fazer a próxima festa de aniversário dele(a) em uma casa de festas completa? Temos duas unidades com estrutura de sonho — posso te enviar um cupom exclusivo de desconto para a primeira festa? 🎁\n\n1️⃣ Sim, quero receber o cupom\n2️⃣ Ainda não é o momento, obrigado",
  ],
  opcoes: [
    { numero: 1, rotulo: "Sim, quero receber o cupom", valor: "sim", sinonimos: ["sim", "quero", "pode mandar", "manda"] },
    { numero: 2, rotulo: "Ainda não é o momento", valor: "nao", sinonimos: ["não", "nao", "agora não", "agora nao", "obrigado"] },
  ],
  proximo: "FIM_RECREACAO",
};

const FIM_RECREACAO: No = {
  id: "FIM_RECREACAO",
  tipo: "mensagem",
  mensagens: ["Qualquer coisa é só me chamar por aqui! Vou ficar à disposição 🌳"],
};

// ---------------------------------------------------------------------------
// Ramo F — opção 6 do menu: coleta descrição livre + handoff imediato
// ---------------------------------------------------------------------------

const N2F: No = {
  id: "N2F",
  tipo: "pergunta_texto",
  campo: "resposta_evento_livre",
  mensagens: ["Claro! Me conta com suas palavras que tipo de evento você está planejando?"],
  proximo: "N3F",
};

const N3F: No = {
  id: "N3F",
  tipo: "handoff",
  motivo: "evento_fora_do_padrao",
  mensagens: [],
};

// ---------------------------------------------------------------------------
// Parte 9 — Handoff
// ---------------------------------------------------------------------------

/**
 * Mensagem de transição (9.2). O documento nomeia o consultor e o segmento;
 * como não existe cadastro de consultor por unidade no sistema, a versão aqui
 * mantém a estrutura e omite o nome — prometer "o João vai te atender" sem
 * saber quem está de plantão seria pior do que a frase genérica.
 */
const N9_HANDOFF: No = {
  id: "N9_HANDOFF",
  tipo: "handoff",
  motivo: "fim_da_qualificacao",
  mensagens: [
    "Perfeito! Vou te conectar agora com nosso(a) consultor(a)[[ da {{unidade_nome}}]].",
    "Ele(a) já tem em mãos todas as informações que conversamos, então é só continuar aqui mesmo por este WhatsApp que a conversa segue no mesmo lugar. 😊",
    "Um instante!",
  ],
};

// ---------------------------------------------------------------------------
// Índice
// ---------------------------------------------------------------------------

const TODOS: No[] = [
  N0_COMERCIAL,
  N0_FORA_HORARIO,
  N1,
  N2A,
  N3A,
  N4A,
  N5A,
  N6A,
  N7A_ARVORE,
  N7A_PARK,
  N8A,
  N2B,
  N3B,
  N4B,
  N5B,
  N6B,
  N2C,
  N3C,
  N4C,
  N5C,
  N6C,
  N7C,
  N8C,
  N9C_POR_DO_SOL,
  N9C_CASARAO,
  N10C,
  N2D,
  N3D,
  N4D,
  N5D,
  N6D,
  N2E,
  N3E,
  N4E,
  FIM_RECREACAO,
  N2F,
  N3F,
  N9_HANDOFF,
];

const POR_ID = new Map<IdNo, No>(TODOS.map((no) => [no.id, no]));

export function obterNo(id: IdNo): No | null {
  return POR_ID.get(id) ?? null;
}

export function todosOsNos(): No[] {
  return TODOS;
}

/**
 * Nós de apresentação por unidade, usados pelos nós de roteamento (N6A e N8C).
 * Ficam aqui, e não no engine, porque a associação unidade → nó é parte da
 * transcrição do documento.
 */
export const NO_DE_APRESENTACAO: Partial<Record<UnidadeRecomendada, IdNo>> = {
  casa_da_arvore: "N7A_ARVORE",
  park_lagos: "N7A_PARK",
  casarao: "N9C_CASARAO",
  casa_por_do_sol: "N9C_POR_DO_SOL",
};

/** Nome de exibição da unidade, usado na interpolação da mensagem de handoff. */
export const NOME_UNIDADE: Record<UnidadeRecomendada, string> = {
  casa_da_arvore: "Casa da Árvore",
  park_lagos: "Casa da Árvore Park Lagos",
  casarao: "Casarão",
  casa_por_do_sol: "Casa Pôr do Sol",
  shopping_park_lagos: "Shopping Park Lagos",
};
