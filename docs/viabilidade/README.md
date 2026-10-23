# Viabilidade de instalação

O módulo fica dentro do painel de indicações, com atalho no menu e acesso pelo detalhe de cada lead. Uma consulta registra um resultado técnico separado do estado comercial do lead, da indicação e da comissão.

## O que já está implementado

- Tela integrada para informar região e coordenadas, apresentar CTOs candidatas, motivos da decisão, histórico e exportação JSON.
- Papéis autorizados: `admin` e `vendedor`. O servidor valida o vínculo e acesso ao lead antes de registrar a consulta.
- Histórico associa o lead quando a consulta começa pelo detalhe do lead. Navegar para outra seção limpa esse contexto.
- A API recusa origem externa, campos inesperados, corpo acima de 16 KiB, lead inacessível e resultado que não pôde ser auditado.
- Migração aditiva `supabase/migrations/202610050001_viability_evaluations.sql`, com histórico por usuário/admin, escrita restrita a `service_role` e exclusão do lead que mantém o histórico sem referência.
- A demonstração só fica disponível em ambiente não produtivo no endereço local. Mesmo se a flag for definida, ela não habilita consultas fictícias em produção.

## Fontes conferidas

A instância IXC respondeu à consulta de listagem de `rad_caixa_ftth` em 4 páginas, total estável de 1.358 registros, IDs sem repetição, 1.356 registros ativos e 2 inativos. Um registro não tem coordenadas e nenhum dos valores presentes falhou a validação numérica. O retorno continha campos de identificação, descrição, status, capacidade, coordenadas e os três campos de associação (`id_projeto`, `id_cidade`, `id_transmissor`). Nomes da associação `id_projeto=1` têm marcadores AC; `id_projeto=2` têm marcadores CP. Isso é evidência para investigação, mas não confirma que esses valores representem todas as CTOs de cada região; a operação precisa confirmar os seletores antes de decisões reais.

A planilha CP/AC foi auditada em leitura. A aba AC contém códigos ambíguos e há linhas sem coordenadas ou vagas confiáveis. A leitura CSV sem autenticação foi conferida em 06/10/2026; a aplicação usa somente A:O, sem alterar compartilhamento. Se o acesso público deixar de existir, a consulta exige análise técnica. Também há adaptador opcional de conta de serviço com escopo `spreadsheets.readonly`.

O cálculo exige confirmar a CTO ativa no IXC, associar uma única linha da planilha à mesma CTO/região, validar as vagas e obter evidência do trajeto. A distância em linha reta localiza candidatas, mas não comprova o trajeto. A preferência é por caminho FiberDocs completo; quando ele não está configurado, está incompleto ou não conecta casa e CTO, o servidor tenta o snapshot local de ruas do OpenStreetMap. Essa rota é uma estimativa viária, não prova que exista fibra, ocupação, autorização ou passagem física, e mantém a CTO em análise técnica. Toda estimativa automática soma trecho, acesso do imóvel, acesso da CTO e 20 m de reserva; a reserva não aparece como trecho no mapa. Trajetos confirmados manualmente preservam o valor registrado. Em 06/10/2026 o responsável informou que a planilha está sempre atualizada: `CURRENT_SNAPSHOT` considera as vagas da leitura atual, com a data da linha apenas informativa. Falha da leitura nunca é tratada como zero vagas.

### Snapshot viário OSM

O arquivo `data/viabilidade/osm/coverage.json` registra os polígonos administrativos públicos identificados para Augusto Corrêa, Aturiaí e Capanema, as localidades operacionais associadas e a data da coleta. O grafo inclui ruas dentro desses polígonos, expandidos em 500 m pelo gerador. Ilha das Pedras, Perimirim, Patal, Trevinho, Açaiteua e Caratateua só ficam cobertos onde estiverem dentro do polígono municipal de Augusto Corrêa; Casa do Ferro usa o polígono municipal de Capanema. Uma localidade fora dessas geometrias não recebe rota OSM. A malha e as divisões administrativas podem estar incompletas ou desatualizadas.

Regere os dois grafos depois de revisar a lista de localidades e a origem dos polígonos:

```powershell
npm.cmd run viabilidade:osm:build
```

O gerador consulta ways `highway=*` no Overpass uma vez por região, usa os IDs de nós do OSM para preservar cruzamentos conectados, filtra as arestas pela cobertura declarada e grava `data/viabilidade/osm/graphs/ac.json.gz` e `cp.json.gz`. Cada arquivo registra a data-base OSM, versão do grafo, contagem e hash. O snapshot de 07/10/2026 (data-base `2026-10-07T14:30:29Z`) contém 5.377 nós e 5.825 arestas em AC (195.255 bytes comprimidos; 1.410.331 descomprimidos) e 12.581 nós e 13.454 arestas em CP (351.489 comprimidos; 3.069.901 descomprimidos), bem abaixo dos limites de 80 MiB e 250 MiB do carregador. O runtime lê somente esses arquivos locais; não envia consultas de endereço ao Overpass nem chama um serviço de roteamento por cliente. Para publicar uma atualização, revise data-base, cobertura e tamanhos dos dois arquivos junto da mudança.

Os dados do OpenStreetMap são disponibilizados sob a licença ODbL. Ao exibir a estimativa, a tela identifica “© OpenStreetMap contributors” e aponta para [openstreetmap.org/copyright](https://www.openstreetmap.org/copyright). A malha inclui vias mapeadas com diferentes condições de acesso; a atribuição não transforma o resultado cartográfico em confirmação de infraestrutura da ISP.

## Testar localmente

O comando abaixo inicia uma sessão local sem usar credenciais de produção:

```powershell
node scripts/dev-viabilidade.mjs --port 3020
```

Abra `http://127.0.0.1:3020/?tab=viabilidade`. Os botões **Com vaga**, **Sem vaga** e **Sem trajeto** usam dados fictícios; o resultado aparece como demonstração e não aprova instalação real.

Para validar a leitura de uma página IXC sem exibir o token ou os dados retornados:

```powershell
node scripts/probe-ixc-read.mjs
```

## Verificação automatizada

```powershell
npm.cmd run test:viabilidade
npm.cmd run test:e2e:viabilidade
npm.cmd run build
```

Os testes incluem decisão geográfica/técnica, paginação e falhas dos adaptadores, RLS e grants PostgreSQL, limite do corpo HTTP, vínculo histórico ao lead, consulta, filtros, exportação, navegação desktop e tela móvel.

## Liberação de consultas reais

O caminho `LIVE` instancia fontes reais e registra a decisão no Supabase. As migrações do histórico e restrição dos grants foram aplicadas ao projeto `ijpyruphiyacjpuwmvdd` em 06/10/2026. A aprovação automática continua desabilitada (`productionReady:false`) enquanto cobertura e trajeto não estiverem comprovados. Configuração:

1. `VIABILITY_LIVE_ENABLED=true` habilita consultas reais autenticadas.
2. `VIABILITY_FRESHNESS_MODE=CURRENT_SNAPSHOT` usa a política informada pela operação. A política alternativa `ROW_DATE` exige `VIABILITY_MAX_UPDATE_AGE_DAYS`.
3. `VIABILITY_SPREADSHEET_ID` é opcional: o padrão é o arquivo informado pelo usuário. `GOOGLE_SERVICE_ACCOUNT_JSON` é opcional para acesso privado e deve ficar exclusivamente nos segredos do servidor.
4. `VIABILITY_IXC_SELECTORS_JSON` permite configurar seletores por região: `{ "AC": { "field": "id_projeto", "values": ["1","3"] }, "CP": { "field": "id_projeto", "values": ["2","21"] } }`. Os padrões foram identificados pelo cadastro oficial `df_projeto`: 1 Augusto Corrêa, 3 Perimirim/Ilha das Pedras, 2 Capanema e 21 Casa do Ferro-CP.
5. A operação confirmou em 06/10/2026 que AC inclui também Patal, Aturiaí, Trevinho, Açaiteua e Caratateua. A configuração publicada usa AC `[1,3,4,5,6,7,8,9,10,11,12,13,14,16,17,18,19,20]` e CP `[2,21]`, cobrindo todos os projetos encontrados no cadastro. `VIABILITY_REGIONAL_COVERAGE_CONFIRMED=true` foi configurado após essa confirmação. A ausência dessa confirmação retorna análise técnica.
6. Trajetos confirmados manualmente têm precedência; senão, uma geometria FiberDocs completa e conectada é estimada; se não houver, o grafo OSM local tenta traçar pelas ruas. OSM não libera instalação e mantém análise técnica. A estimativa automática, FiberDocs ou OSM, soma 20 m de reserva uma vez. O servidor LIVE nunca reaproveita a evidência fictícia DEMO.

Leitura completa nos projetos identificados: AC 268 CTOs / 732 linhas da planilha, 101 associações e 90 correspondências ambíguas; CP 676 CTOs / 657 linhas, 615 associações. As associações não certificam coordenadas, restrições nem trajeto. Esses resultados são de 06/10/2026 e não substituem a leitura atual de cada avaliação.

Não é necessário usar n8n para a consulta interativa no painel: IXC, Google Sheets e o serviço de rotas são chamados pelo servidor Next.js. n8n pode ser acrescentado depois para tarefas agendadas ou avisos, sem substituir a autorização e a decisão dentro do painel.

## Parâmetros de decisão

| Parâmetro | Valor | Observação |
|---|---|---|
| Limite de cabo | 500 m | Vale para o cabo total: rede, acesso ao imóvel, acesso à CTO e reserva. O filtro em linha reta é só um atalho. |
| Reserva de cabo | 20 m | Somada às estimativas automáticas. |
| Encaixe em rua ou cabo | 30 m | Acima disso não há trajeto estimado. |
| União de cabos por poste | 3 m | |
| Tolerância de posição IXC × planilha | 25 m | Acima disso a CTO fica bloqueada (`COORDENADAS_DIVERGENTES`). Era 1 m, o que bloqueava quase todas as CTOs. |
| Trajeto só por ruas (OSM) | análise técnica | Rua não comprova cabo instalado nem autorização de passagem. |
