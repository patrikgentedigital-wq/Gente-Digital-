# Estimativa de trajeto por ruas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calcular e desenhar, no painel de viabilidade, um caminho estimado pelas ruas OSM com acessos e reserva de fibra de 20 m quando não houver rota FiberDocs completa.

**Architecture:** Gerar um grafo OSM regional versionado fora das consultas de clientes, carregá-lo localmente no runtime Node e usar A* no backend. O servidor centraliza o cálculo e retorna métricas e geometrias transitórias; a auditoria guarda apenas fonte, metragem, componentes agregados e versão do grafo. A interface distingue OSM, FiberDocs e linha reta e mantém análise técnica quando a rota OSM é a única evidência de trajeto.

**Tech Stack:** Next.js 15 / TypeScript / Node.js, API de dados Overpass para snapshot OSM, `@turf/buffer` 7.4.0 somente no gerador, JSON gzip para os grafos, Leaflet / React-Leaflet para exibição.

**Spec:** `docs/superpowers/specs/2026-10-07-osm-street-route-design.md`

## Global Constraints

- Algoritmo determinístico A* sobre grafo OSM regional empacotado no servidor.
- A cobertura é uma união de polígonos públicos das localidades operacionais por região, com margem de 500 m; não derivar cobertura de coordenadas de clientes ou CTOs.
- O encaixe do imóvel e da CTO na malha viária tem limite de 30 m por extremidade.
- Total automático = comprimento do trecho de rua/rede + acesso do imóvel + acesso da CTO + exatamente 20 m de reserva.
- Manter a distância em linha reta como métrica separada; comparar o valor não arredondado e arredondar apenas a apresentação.
- Rota OSM não confirma cabo, ocupação, continuidade, autorização ou instalação; se for a única evidência de trajeto, manter `ANALISE_TECNICA`.
- Uma estimativa OSM acima de 500 m não causa sozinha status `INVIAVEL`; bloqueios independentes comprovados pelas fontes continuam valendo.
- A estimativa automática FiberDocs também recebe os 20 m uma única vez. Evidência confirmada manualmente permanece com o valor registrado.
- A interface não calcula rotas; polilinhas não são persistidas na auditoria ou histórico.
- Nenhuma chamada pública de roteamento por cliente/endereço; carregar apenas o snapshot regional local durante a consulta.
- Preservar todas as alterações preexistentes no checkout. Não incluir arquivos sem relação no staging/commit.
- Não publicar em produção sem autorização específica. Após a solicitação do usuário para validar o comportamento, implementar testes focados em TDD: confirmar uma falha esperada antes de alterar o motor e executar a suíte de viabilidade ao concluir.

## Review Focus

- Grafo ausente, inválido ou sem polígono para a localidade → sem linha de rota, causa identificável e análise técnica. **Etapa proprietária:** Task 3; revisão manual da resposta sem rota.
- Instalação ou CTO a mais de 30 m da via → não encaixar no nó mais próximo nem desenhar atalho como rota válida. **Etapa proprietária:** Task 2; revisão manual das duas extremidades.
- Cruzamento geométrico sem nó OSM compartilhado → manter trechos desconectados. **Etapa proprietária:** Tasks 1 e 2; revisar a topologia gerada.
- FiberDocs parcial ou sem caminho contínuo → não desenhar caminho de cabos parcial; calcular OSM se grafo e encaixes permitirem. **Etapa proprietária:** Task 4; revisar a precedência e o `routeSource`.
- Total de exemplo 260 + 12 + 8 + 20 = 300 m; valores acima de 500 m não podem, apenas por serem OSM, aprovar ou reprovar a CTO. **Etapa proprietária:** Task 4; revisar componentes, status e aplicação de bloqueios independentes.

---

## Mapa de arquivos

- `data/viabilidade/osm/coverage.json`: polígonos públicos de cobertura AC/CP, margem, origem e data.
- `data/viabilidade/osm/graphs/ac.json.gz` e `cp.json.gz`: grafos compactados, metadados OSM e versão do snapshot.
- `scripts/viabilidade/build-osm-road-graphs.mjs`: obtém e converte ways viárias OSM para o formato do runtime.
- `lib/viabilidade/domain/road-route.ts`: tipos do grafo, encaixe em aresta e busca A* pura.
- `lib/viabilidade/road-graph.ts`: leitura, descompressão, validação e cache server-side dos artefatos.
- `lib/viabilidade/domain/types.ts`: origem, componentes da rota, metadados e geometria transitória da decisão.
- `lib/viabilidade/service.ts`: escolha entre confirmação, FiberDocs completo e fallback OSM; produz uma resposta coerente para distância e mapa.
- `lib/viabilidade/domain/decide.ts`: aplica status/restrições sem promover OSM a prova física.
- `lib/viabilidade/handler.ts`, `lib/viabilidade/runtime.ts`, `app/api/viabilidade/route.ts`: injeção do grafo local e retorno das geometrias transitórias.
- `lib/viabilidade/audit.ts`: whitelist dos novos campos persistidos sem guardar polilinha.
- `lib/viabilidade/activity.ts`, `components/views/viabilidade.tsx`, `components/views/coverage-map.tsx`: detalhamento, histórico e representação do mapa.
- `next.config.ts`: inclusão dos artefatos gzip na função da API.
- `docs/viabilidade/README.md`, `docs/fiberdocs-viabilidade.md`: origem, atualização, limites e precedência das fontes.

## Interfaces compartilhadas

Task 2 define os tipos consumidos pelas Tasks 3 e 4:

```ts
type RouteSource = 'CONFIRMED' | 'FIBERDOCS_ESTIMATE' | 'OSM_ESTIMATE';
type RouteComponents = {
  lineMeters: number;
  installAccessMeters: number;
  ctoAccessMeters: number;
  reserveMeters: number;
  totalMeters: number;
};
type RouteGeometry = {
  ctoId: string;
  source: 'FIBERDOCS_ESTIMATE' | 'OSM_ESTIMATE';
  points: Point[];
};
type StreetRoute = {
  points: Point[];
  streetMeters: number;
  installAccessMeters: number;
  ctoAccessMeters: number;
};
```

`Candidate.routeMeters` permanece o total comparável com o limite; `Candidate.routeComponents` guarda o detalhamento agregado ou `null` para confirmação manual. `Decision.sources` recebe `roadGraphVersion` e `roadGraphUpdatedAt` quando OSM for usado. A resposta POST acrescenta `routeGeometries: RouteGeometry[]`; o auditor não recebe esse campo.

### Task 1: Cobertura e snapshot de ruas OSM

**Files:**
- Create: `data/viabilidade/osm/coverage.json`
- Create: `scripts/viabilidade/build-osm-road-graphs.mjs`
- Create: `data/viabilidade/osm/graphs/ac.json.gz`
- Create: `data/viabilidade/osm/graphs/cp.json.gz`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `docs/viabilidade/README.md`

**Interfaces:**
- Consumes: nomes de localidades/projetos AC e CP no README e seletores atuais em `lib/viabilidade/runtime.ts`.
- Produces: para cada região, metadados `{ schemaVersion, region, snapshotAt, graphVersion, coverageSource, nodeCount, edgeCount }`, nós por ID OSM e arestas com nós extremos, geometria, comprimento e tags necessárias.

- [ ] Mapear cada localidade operacional listada para um polígono público identificável. Registrar a origem/ID OSM e a data em `coverage.json`; localidade ambígua fica explicitamente sem cobertura, sem inferir área a partir de dados de clientes.
- [ ] Registrar em `coverage.json` os polígonos originais, IDs/origem pública e data; no gerador, expandir cada polígono em 500 m com `@turf/buffer` usando unidade `meters`. [API oficial do Turf buffer](https://turfjs.org/docs/api/buffer).
- [ ] Adicionar `@turf/buffer` 7.4.0 como dependência de desenvolvimento, pois só é usado para preparar o snapshot e não entra no runtime da aplicação.
- [ ] Implementar o gerador para obter ways com `highway=*` na cobertura e reter IDs de nós e geometria. Usar o formato `out body geom` do Overpass para preservar as referências topológicas e coordenadas; não unir linhas apenas por cruzamento visual. [Documentação Overpass QL](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL).
- [ ] Fixar no gerador as classes incluídas (`motorway`, `motorway_link`, `trunk`, `trunk_link`, `primary`, `primary_link`, `secondary`, `secondary_link`, `tertiary`, `tertiary_link`, `unclassified`, `residential`, `living_street`, `service`, `road`, `track`); excluir as demais classes e `area=yes`. Preservar tags `access` para conferência, sem tratá-las como sentido de trânsito; ignorar `oneway` por se tratar de infraestrutura fixa. Gerar versão determinística do grafo por snapshot.
- [ ] Comprimir e gravar os dois artefatos, com metadados de origem, cobertura, data, versão do gerador e contagens. Não inserir CTOs, coordenadas de instalação ou dados privados do IXC.
- [ ] Registrar tamanhos comprimido/descomprimido; comparar com os limites de empacotamento e memória do runtime antes de considerar o artefato publicável.
- [ ] Documentar no README a atualização manual dos snapshots, a licença/atribuição OSM, a margem e a condição de cobertura ausente.

**Entrega revisável:** os dois arquivos gzip contêm cobertura declarada e topologia por IDs OSM, sem dados operacionais privados; localidades sem polígono ficam listadas como não cobertas.

### Task 2: Roteador A* local e encaixes

**Files:**
- Create: `lib/viabilidade/domain/road-route.ts`
- Modify: `lib/viabilidade/domain/types.ts`

**Interfaces:**
- Consumes: um `RoadGraph`, o ponto do imóvel e destinos `{ id, location }`.
- Produces: `estimateStreetRoutes(graph, start, targets): Map<string, StreetRoute | null>` e os tipos compartilhados `RouteSource`, `RouteComponents`, `RouteGeometry`.

- [ ] Definir os tipos do grafo com IDs OSM estáveis, nós geográficos, arestas bidirecionais, polilinha ordenada, índice espacial e componentes conectados.
- [ ] Implementar projeção local em segmento para encaixar cada ponta na via mais próxima, limitando ambos os acessos a 30 m.
- [ ] Implementar o índice espacial para procurar apenas segmentos próximos; manter a busca determinística e não criar interseção entre vias sem nó OSM compartilhado.
- [ ] Implementar A* com comprimento geodésico como peso e distância geodésica ao destino como heurística; reconstruir todos os pontos da via entre os encaixes.
- [ ] Retornar `null` para coordenadas inválidas, encaixe acima de 30 m ou componentes desconectados; a função não acrescenta a reserva de 20 m.

**Entrega revisável:** assinatura e tipos permitem consultar várias CTOs a partir de uma coordenada e recebem geometria de rua mais dois acessos, sem calcular a reserva.

### Task 3: Carregamento server-side e empacotamento Vercel

**Files:**
- Create: `lib/viabilidade/road-graph.ts`
- Modify: `lib/viabilidade/runtime.ts`
- Modify: `lib/viabilidade/handler.ts`
- Modify: `app/api/viabilidade/route.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: `RoadGraph` e os artefatos da Task 1.
- Produces: `loadRoadGraph(region: Region): Promise<RoadGraph | null>` com cache por processo e validação de schema/versão; dependência injetável no handler.

- [ ] Implementar leitura gzip no runtime Node, validar `schemaVersion`, região e metadados, e guardar o grafo carregado em cache de módulo para reutilizar entre consultas na instância.
- [ ] Tratar arquivo ausente, inválido ou cobertura ausente como fonte indisponível; não buscar substituto externo durante a avaliação.
- [ ] Injetar o loader no runtime/handler sem alterar a autenticação nem os limites da API existentes.
- [ ] Configurar `outputFileTracingIncludes` para que os dois arquivos de grafo acompanhem a função `/api/viabilidade`, usando o padrão de inclusão por rota do [Next.js 15](https://nextjs.org/docs/15/app/api-reference/config/next-config-js/output).
- [ ] Incluir no estado das fontes que o grafo local OSM fornece estimativa de rua sujeita a conferência; não marcar a consulta como pronta para instalação.

**Entrega revisável:** a API resolve o grafo local de AC/CP, ou recebe estado explícito de indisponibilidade, sem chamada de roteamento externo.

### Task 4: Precedência, métricas e decisão

**Files:**
- Modify: `lib/viabilidade/domain/types.ts`
- Modify: `lib/viabilidade/domain/network-path.ts`
- Modify: `lib/viabilidade/domain/decide.ts`
- Modify: `lib/viabilidade/service.ts`
- Modify: `lib/viabilidade/handler.ts`

**Interfaces:**
- Consumes: rotas FiberDocs existentes, loader/estimador OSM das Tasks 2–3 e `RouteEvidence` confirmado.
- Produces: `evaluate(...)` retorna `{ decision, network, routeGeometries }`; `Candidate.routeMeters` é o total e `Candidate.routeComponents` contém valores agregados.

- [ ] Alterar o cálculo do serviço para manter geometria e métricas no mesmo resultado server-side; o mapa deixa de reconstruir a rota FiberDocs a partir da rede bruta.
- [ ] Aplicar precedência por CTO: evidência manual correspondente; senão FiberDocs apenas com leitura completa e caminho conectado; senão OSM; sem caminho OSM, sem geometria.
- [ ] Somar exatamente 20 m às estimativas automáticas FiberDocs e OSM uma vez. Preservar o valor manual sem acréscimo. Calcular o limite com o total sem arredondamento.
- [ ] Produzir `routeGeometries` somente para rotas calculadas. Manter pontos de acesso na polilinha; não desenhar a reserva de 20 m.
- [ ] Adicionar `OSM_ESTIMATE` e causas específicas de ausência de grafo/cobertura/encaixe/conexão aos tipos e à decisão.
- [ ] Impedir que a estimativa OSM, isoladamente, classifique como `VIAVEL` ou `INVIAVEL` ou gere recomendação. Se for a única evidência de trajeto, manter `ANALISE_TECNICA`; preservar bloqueios independentes como `SEM_VAGAS`.
- [ ] Para OSM acima de 500 m, manter análise técnica e registrar que o total estimado excedeu o limite; FiberDocs e trajetos manuais seguem as regras atuais de decisão, com a nova reserva somente para a estimativa automática FiberDocs.
- [ ] Incluir versão/data do grafo nos metadados da decisão quando pelo menos uma rota OSM for calculada.

**Entrega revisável:** para qualquer rota desenhada, `routeMeters` corresponde à soma de componentes, e geometria e origem são as mesmas usadas pela decisão.

### Task 5: Auditoria, histórico e ficha técnica

**Files:**
- Modify: `lib/viabilidade/audit.ts`
- Modify: `lib/viabilidade/activity.ts`
- Modify: `components/views/viabilidade.tsx`

**Interfaces:**
- Consumes: `Candidate.routeSource`, `routeMeters`, `routeComponents` e metadados do grafo da Task 4.
- Produces: histórico sanitizado com fonte e componentes; ficha técnica lista a origem e as quatro parcelas sem coordenadas ou polilinha.

- [ ] Atualizar `auditRecord` para persistir origem, total, componentes agregados e versão/data OSM, sem persistir geometria nem coordenadas adicionais.
- [ ] Atualizar o leitor de auditoria para aceitar `OSM_ESTIMATE`, validar os componentes numéricos e manter a whitelist de campos conhecidos. O formato segue no `result` JSON existente; não criar migração.
- [ ] Atualizar a atividade técnica para nomear a origem e, quando estimativa automática, escrever trecho de rede/rua, acesso do imóvel, acesso da CTO, reserva de 20 m e total.
- [ ] Ampliar a linha de histórico para exibir a origem do trajeto e o detalhamento da CTO indicada ou da candidata mais próxima calculada, mantendo `LIVE/DEMO` como origem da avaliação em campo separado.
- [ ] Manter compatibilidade com registros antigos sem `routeComponents` ou `OSM_ESTIMATE`; mostrá-los sem detalhamento novo em vez de invalidar o histórico.

**Entrega revisável:** o histórico explica como chegou à metragem sem guardar a linha espacial; atividades antigas continuam legíveis.

### Task 6: Mapa e cartões de resultado

**Files:**
- Modify: `components/views/coverage-map.tsx`
- Modify: `components/views/viabilidade.tsx`
- Modify: `app/globals.css` apenas se necessário para diferenciar as linhas

**Interfaces:**
- Consumes: `routeGeometries` transitórias da resposta POST, métricas agregadas e `Decision.sources.roadGraphVersion/roadGraphUpdatedAt`.
- Produces: mapa desenha a geometria do servidor para a CTO selecionada; cartões e atividade mostram o mesmo total/origem.

- [ ] Guardar `routeGeometries` separadamente da decisão no estado cliente, removê-las antes de montar `Decision`, e limpar a geometria ao trocar endereço/região ou iniciar nova consulta.
- [ ] Alterar `CoverageMap` para receber geometrias/metadata do servidor e eliminar o cálculo local `estimateCablePath`; manter cabos e postes FiberDocs como camadas de referência.
- [ ] Desenhar OSM com estilo/legenda distintos dos cabos e estimativas FiberDocs; a visibilidade da camada de cabos não deve apagar a rota OSM.
- [ ] Exibir a origem OSM, data do grafo e atribuição OSM perto da legenda. A polilinha mostra rua e acessos, nunca a reserva espacial.
- [ ] Atualizar cartões para distinguir “linha reta”, “rota FiberDocs estimada”, “rota estimada pelas ruas (OSM)” e “trajeto confirmado”; apresentar parcelas e total da rota automática.
- [ ] Mostrar mensagem de análise técnica para rota OSM, inclusive quando o total estiver até 500 m, e mensagem de limite excedido quando o total superar 500 m.
- [ ] Mostrar ausência de rota conforme causa disponível, sem desenhar a distância em linha reta como se fosse caminho.

**Entrega revisável:** numa avaliação de CTO selecionada, a linha do mapa e o cartão mostram a mesma fonte e total; OSM permanece visualmente distinto dos cabos FiberDocs.

### Task 7: Documentação e revisão de escopo

**Files:**
- Modify: `docs/viabilidade/README.md`
- Modify: `docs/fiberdocs-viabilidade.md`
- Review only: `docs/superpowers/specs/2026-10-07-osm-street-route-design.md`

**Interfaces:**
- Consumes: comportamento final das Tasks 1–6.
- Produces: instrução operacional para atualizar snapshots, entender limitações e interpretar origem/metragem/reserva.

- [ ] Documentar como regenerar/substituir snapshots OSM, conferir metadados e atribuir fonte/licença.
- [ ] Atualizar a documentação FiberDocs para explicar o fallback OSM, a centralização de geometria no servidor e a reserva de 20 m nas estimativas automáticas.
- [ ] Revisar cada critério da especificação e apontar o arquivo/tarefa que o atende; nenhuma linha OSM pode ser descrita como confirmação de fibra.
- [ ] Revisar `git status` e garantir que qualquer commit futuro inclua apenas os arquivos desta implementação explicitamente aprovados; manter as alterações preexistentes separadas.

## Handoff

Plano dividido em sete entregas porque cobertura/dados, motor de caminho, serviço de decisão, persistência e interface têm fronteiras revisáveis, mas compartilham os tipos definidos nas primeiras tarefas. A execução recomendada é **Native**, em ordem, neste checkout: vários arquivos alvo já contêm alterações preexistentes desta tarefa, e a implementação precisa preservá-las em vez de delegar mudanças concorrentes no mesmo conjunto de arquivos.

O usuário confirmou que o comportamento deve ser validado. A execução inclui testes automatizados focados; a aprovação do método continua separada de qualquer publicação, que exige autorização específica.
