export const PROGRAM_RULES = {
  colaborador: {
    taxaPorVenda: 20,
    taxaVolume: 30,
    volumeThreshold: 10,
  },
  bonusTop: {
    valor: 100,
    minimoIndicacoes: 15,
  },
  clienteIndicador: {
    descontoMensalidade: 50,
  },
  pontos: {
    porIndicacao: 20,
    porConversao: 50,
  },
  prazoPagamento: 'em até 7 dias úteis após a instalação do cliente',
  cookieDuracaoDias: 30,
  linkBasePadrao: 'https://forms.cloud.microsoft/r/xwCZ3REw80',
} as const;

export const RULES_COPY = {
  colaboradorBase: `R$ ${PROGRAM_RULES.colaborador.taxaPorVenda},00 no PIX por venda`,
  colaboradorVolume: `R$ ${PROGRAM_RULES.colaborador.taxaVolume},00 no PIX por venda (a partir de ${PROGRAM_RULES.colaborador.volumeThreshold} vendas no período)`,
  bonusTop: `+ R$ ${PROGRAM_RULES.bonusTop.valor},00 de bônus PIX para o top indicador com ${PROGRAM_RULES.bonusTop.minimoIndicacoes}+ indicações`,
  clienteIndicador: `R$ ${PROGRAM_RULES.clienteIndicador.descontoMensalidade},00 de desconto na mensalidade do cliente que indicar`,
  prazoPagamento: `Comissões pagas ${PROGRAM_RULES.prazoPagamento}.`,
} as const;
