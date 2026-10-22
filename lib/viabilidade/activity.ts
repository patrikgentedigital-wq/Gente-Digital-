import type { Candidate, Decision } from './domain/types';

const statusLabels = { VIAVEL: 'Viável', INVIAVEL: 'Inviável', ANALISE_TECNICA: 'Análise técnica' } as const;
const reasonLabels: Record<string, string> = {
  CTO_AMBIGUA: 'Mais de uma linha da planilha corresponde ao código da CTO.',
  CTO_AUSENTE_NA_PLANILHA: 'CTO não localizada na planilha.',
  CTO_NAO_RECONHECIDA: 'O código da CTO não pôde ser interpretado.',
  COORDENADAS_DIVERGENTES: 'A posição do IXC diverge da posição registrada na planilha.',
  COORDENADA_IXC_AUSENTE: 'A CTO não tem coordenada no IXC.',
  COORDENADA_PLANILHA_INVALIDA: 'A planilha não informa coordenada; a posição da rota vem do IXC e dos cabos FiberDocs.',
  CAPACIDADE_DIVERGENTE: 'A capacidade cadastrada no IXC e na planilha é diferente.',
  VAGAS_NAO_CONFIRMADAS: 'A quantidade de vagas da planilha não foi confirmada.',
  VAGAS_ACIMA_DA_CAPACIDADE: 'As vagas informadas excedem a capacidade do split.',
  SEM_VAGAS: 'A CTO está sem vagas.',
  TRAJETO_NAO_CONFIRMADO: 'Não foi possível confirmar um caminho contínuo até a CTO.',
  TRAJETO_ESTIMADO_FIBERDOCS: 'Metragem calculada pela geometria de cabos do FiberDocs.',
  TRAJETO_ESTIMADO_OSM: 'Trajeto estimado pela vias mapeadas no OpenStreetMap; a fibra e a passagem física precisam de conferência.',
  OSM_GRAFO_INDISPONIVEL: 'O grafo regional de ruas não está disponível neste servidor.',
  OSM_FORA_DA_COBERTURA: 'O ponto de instalação ou a CTO está fora da cobertura do grafo de ruas.',
  OSM_ENCAIXE_FORA_DA_VIA: 'O imóvel ou a CTO fica a mais de 30 m da via mais próxima no grafo OSM.',
  OSM_SEM_CAMINHO_CONTINUO: 'A malha de ruas não tem um caminho conectado entre a casa e a CTO.',
  OSM_ESTIMATIVA_ACIMA_DO_LIMITE: 'A estimativa pelas ruas com acessos e reserva supera 500 m e precisa de análise técnica.',
  TRAJETO_FORA_DO_LIMITE: 'A metragem do trajeto ultrapassa 500 m.',
  CTO_FORA_DO_LIMITE: 'A CTO fica além do limite de 500 m em linha reta.',
  FIBERDOCS_LEITURA_INDISPONIVEL: 'Não foi possível consultar o FiberDocs.',
  FIBERDOCS_REDE_INCOMPLETA: 'Há cabos sem geometria no FiberDocs.',
  FIBERDOCS_SEM_CABOS: 'Não há geometria de cabos disponível no FiberDocs.',
  REDE_SEM_CAMINHO_CONTINUO: 'Os cabos cadastrados não formam um caminho contínuo até a CTO.',
  DADOS_DESATUALIZADOS: 'As vagas estão fora do prazo de validade configurado.',
  RESTRICAO_PENDENTE_REVISAO: 'Há uma restrição técnica que precisa de revisão.',
  DATA_ATUALIZACAO_AUSENTE: 'A data de atualização das vagas não foi informada.',
  DATA_ATUALIZACAO_FUTURA: 'A data de atualização das vagas está no futuro.',
  DATA_ATUALIZACAO_INVALIDA: 'A data de atualização das vagas é inválida.',
  FONTE_IXC_INCOMPLETA: 'A leitura do IXC ficou incompleta.',
  FONTE_PLANILHA_INCOMPLETA: 'A leitura da planilha ficou incompleta.',
  ESQUEMA_PLANILHA_ALTERADO: 'A estrutura da planilha mudou.',
  COBERTURA_REGIONAL_NAO_CONFIRMADA: 'A cobertura dos projetos desta região não está confirmada.',
  REGRA_VALIDADE_NAO_CONFIGURADA: 'O prazo de validade das vagas não está configurado.',
  CANDIDATA_COM_DADOS_INSUFICIENTES: 'Uma ou mais CTOs precisam de conferência técnica.'
};

function nearestCandidate(decision: Decision): Candidate | null {
  const candidates = decision.candidates ?? [];
  const chosen = decision.recommendedCtoId && candidates.find(candidate => candidate.ctoId === decision.recommendedCtoId);
  if (chosen) return chosen;
  return [...candidates].sort((a, b) => (a.routeMeters ?? Infinity) - (b.routeMeters ?? Infinity)
    || (a.geographicMeters ?? Infinity) - (b.geographicMeters ?? Infinity) || a.ctoId.localeCompare(b.ctoId))[0] ?? null;
}

function distance(value: number | null): string {
  return value === null ? 'não calculada' : `${Math.round(value).toLocaleString('pt-BR')} m`;
}

function timestamp(value: string | null | undefined): string {
  if (!value) return 'não registrada';
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : 'não registrada';
}

function sheetRow(candidate: Candidate, match: NonNullable<Candidate['sheetMatches']>[number]): string {
  return `${match.sheet} · linha ${match.row} — ${match.originalName}; OLT ${match.olt ?? 'não informada'}; VLAN/PON ${match.pon ?? 'não informada'}; ${match.available === null ? 'vagas não confirmadas' : `${match.available} ${match.available === 1 ? 'vaga' : 'vagas'}`}; split ${match.capacity ?? candidate.sheetCapacity ?? 'não informado'}`;
}

export function buildTechnicalActivityText(decision: Decision, context: { address: string; leadId: number | null }): string {
  const candidate = nearestCandidate(decision);
  const lines = [
    'Ficha técnica de viabilidade',
    ...(context.leadId ? [`Lead #${context.leadId}`] : []),
    ...(context.address.trim() ? [`Endereço: ${context.address.trim()}`] : []),
    `Resultado: ${statusLabels[decision.status]}`
  ];
  if (candidate) {
    lines.push(decision.recommendedCtoId === candidate.ctoId ? `CTO indicada: IXC #${candidate.ctoId}` : `CTO candidata para conferência: IXC #${candidate.ctoId}`);
    if (candidate.sheetCtoName && candidate.sheet !== null && candidate.row !== null) {
      lines.push(`Planilha: ${candidate.sheet} · linha ${candidate.row} — ${candidate.sheetCtoName}`);
    }
    const matches = candidate.sheetMatches ?? [];
    if (matches.length > 1) {
      lines.push('Linhas que conflitam:');
      for (const match of matches) lines.push(`- ${sheetRow(candidate, match)}`);
    } else if (matches.length === 1 && !candidate.sheetCtoName) {
      lines.push(`Planilha: ${sheetRow(candidate, matches[0]!)}`);
    } else if (matches.length === 1 && matches[0]!.pon) {
      lines.push(`OLT ${matches[0]!.olt ?? 'não informada'} · VLAN/PON ${matches[0]!.pon}`);
    }
    lines.push(`Distância em linha reta: ${distance(candidate.geographicMeters)}`);
    lines.push(`${candidate.routeSource === 'FIBERDOCS_ESTIMATE' ? 'Rota FiberDocs' : candidate.routeSource === 'OSM_ESTIMATE' ? 'Rota estimada pelas ruas (OSM)' : candidate.routeSource === 'CONFIRMED' ? 'Trajeto confirmado' : 'Trajeto'}: ${distance(candidate.routeMeters)}`);
    if (candidate.routeComponents) {
      lines.push(`Trecho de rua/rede: ${distance(candidate.routeComponents.lineMeters)}`);
      lines.push(`Acesso do imóvel até a rede: ${distance(candidate.routeComponents.installAccessMeters)}`);
      lines.push(`Acesso da CTO até a rede: ${distance(candidate.routeComponents.ctoAccessMeters)}`);
      lines.push(`Reserva de fibra: ${distance(candidate.routeComponents.reserveMeters)}`);
      lines.push(`Total estimado: ${distance(candidate.routeComponents.totalMeters)}`);
    }
    lines.push(`Vagas atuais na planilha: ${candidate.available === null ? 'não confirmadas' : `${candidate.available} ${candidate.available === 1 ? 'vaga' : 'vagas'}`}`);
    lines.push(`Capacidade (IXC / planilha): ${candidate.ixcCapacity ?? 'não informada'} / ${candidate.sheetCapacity ?? 'não informada'}`);
    lines.push(`Atualização das vagas: ${candidate.updatedOn ?? 'não informada'}`);
  } else {
    lines.push('Nenhuma CTO candidata foi encontrada nesta consulta.');
  }
  lines.push(`IXC consultado: ${timestamp(decision.sources?.ixcFetchedAt)}`);
  lines.push(`Planilha consultada: ${timestamp(decision.sources?.sheetsFetchedAt)}`);
  if (candidate?.routeSource === 'OSM_ESTIMATE') {
    lines.push(`Grafo de ruas OSM: ${decision.sources.roadGraphVersion ?? 'versão não registrada'} · atualizado em ${timestamp(decision.sources.roadGraphUpdatedAt)}`);
    lines.push('A linha segue vias mapeadas e é uma estimativa; não confirma cabo, ocupação, autorização ou passagem física. A instalação permanece em análise técnica.');
  }
  const allReasons = [...new Set([...(decision.reasons ?? []), ...(candidate?.reasons ?? [])])];
  const informational: string[] = allReasons.filter(code => code === 'COORDENADA_PLANILHA_INVALIDA');
  if (informational.length) lines.push('Observações:', ...informational.map(code => `- ${reasonLabels[code]}`));
  const reasons = allReasons.filter(code => code !== 'TRAJETO_ESTIMADO_FIBERDOCS' && code !== 'TRAJETO_ESTIMADO_OSM' && !informational.includes(code));
  if (reasons.length) lines.push('Pendências:', ...reasons.map(code => `- ${reasonLabels[code] ?? 'Conferir dado técnico: ' + code.replaceAll('_', ' ').toLocaleLowerCase('pt-BR')}`));
  if (decision.status === 'VIAVEL') lines.push('Próxima ação: Prosseguir com a instalação pela CTO e rota indicadas, conforme o procedimento técnico.');
  else if (decision.status === 'INVIAVEL') lines.push('Próxima ação: Não agendar instalação neste ponto com os dados consultados.');
  else lines.push('Próxima ação: Resolver as pendências antes de agendar a instalação.');
  return lines.join('\n');
}
