const descriptions:Record<string,string>={
  FIBERDOCS_COORDENADAS_INDISPONIVEIS:'Não foi possível ler as coordenadas dos elementos no IXC.',
  FIBERDOCS_COORDINATES_ROW_SHAPE_INVALID:'O IXC respondeu, mas os campos das coordenadas não correspondem ao formato esperado.',
  FIBERDOCS_COORDINATES_SCOPE_INVALID:'O IXC retornou coordenadas sem vínculo verificável com o elemento consultado.',
  FIBERDOCS_COORDINATES_DUPLICATE_ROW:'O IXC retornou coordenadas duplicadas; o mapa não desenha essa leitura incompleta.',
  FIBERDOCS_COORDINATES_SCHEMA_OR_PAGE_INVALID:'O IXC respondeu, mas a paginação ou o formato da tabela de coordenadas mudou.',
  FIBERDOCS_COORDINATES_TIMEOUT:'A leitura das coordenadas no IXC excedeu o tempo limite.',
  FIBERDOCS_COORDINATES_REQUEST_FAILED:'Falha de rede ao consultar coordenadas no IXC.',
  FIBERDOCS_COORDINATE_DATA_ROW_SHAPE_INVALID:'O IXC respondeu, mas os campos geográficos de df_coordenada não correspondem ao formato esperado.',
  FIBERDOCS_COORDINATE_DATA_ROWS_MISSING:'O IXC não encontrou os pontos referenciados por df_elemento_coordenada.id_coordenada.',
  FIBERDOCS_COORDINATE_DATA_SCHEMA_OR_PAGE_INVALID:'O IXC respondeu, mas a paginação ou o formato da tabela df_coordenada mudou.',
  FIBERDOCS_COORDINATE_DATA_SCOPE_INVALID:'O IXC retornou pontos sem vínculo verificável com os IDs consultados.',
  FIBERDOCS_COORDINATE_DATA_DUPLICATE_ROW:'O IXC retornou pontos duplicados; o mapa não desenha essa leitura incompleta.',
  CABO_GEOMETRIA_PENDENTE:'Há cabos sem vértices válidos; eles não são desenhados.',
  POSTES_SEM_COORDENADA:'Há postes sem coordenada válida; eles não são desenhados.',
  FIBERDOCS_GEOMETRY_LIMIT:'A exibição foi limitada para proteger o mapa.',
};

export function describeFiberDocsIssue(issue:string):string|null {
  const http=issue.match(/^FIBERDOCS_COORDINATES_HTTP_(\d{3})$/)?.[1];
  if(http==='400')return 'O IXC rejeitou o filtro da tabela df_elemento_coordenada (HTTP 400); o nome do campo ou operador precisa ser ajustado.';
  if(http==='401')return 'O IXC recusou a credencial Basic Auth ao ler df_elemento_coordenada (HTTP 401).';
  if(http==='403')return 'O IXC negou permissão Webservice para ler df_elemento_coordenada (HTTP 403).';
  if(http==='404')return 'A tabela df_elemento_coordenada não foi encontrada no endpoint do IXC (HTTP 404).';
  if(http==='429')return 'O IXC limitou temporariamente a leitura das coordenadas (HTTP 429).';
  if(http&&Number(http)>=500)return `O IXC falhou ao ler as coordenadas (HTTP ${http}); tente novamente mais tarde.`;
  const dataHttp=issue.match(/^FIBERDOCS_COORDINATE_DATA_HTTP_(\d{3})$/)?.[1];
  if(dataHttp==='400')return 'O IXC rejeitou o filtro da tabela df_coordenada (HTTP 400); o nome do campo ou operador precisa ser ajustado.';
  if(dataHttp==='401')return 'O IXC recusou a credencial Basic Auth ao ler df_coordenada (HTTP 401).';
  if(dataHttp==='403')return 'O IXC negou permissão Webservice para ler df_coordenada (HTTP 403).';
  if(dataHttp==='404')return 'A tabela df_coordenada não foi encontrada no endpoint do IXC (HTTP 404).';
  if(dataHttp==='429')return 'O IXC limitou temporariamente a leitura de df_coordenada (HTTP 429).';
  if(dataHttp&&Number(dataHttp)>=500)return `O IXC falhou ao ler df_coordenada (HTTP ${dataHttp}); tente novamente mais tarde.`;
  return descriptions[issue]??null;
}

export function describeFiberDocsIssues(issues:string[]):string[] {
  return [...new Set(issues.map(describeFiberDocsIssue).filter((message):message is string=>Boolean(message)))];
}
