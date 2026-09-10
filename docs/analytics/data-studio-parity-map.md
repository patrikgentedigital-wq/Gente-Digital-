# Mapa de paridade do Data Studio

Este mapa congela o contrato de investigação das páginas `GERAL`, `ATENDIMENTO` e `CANCELAMENTOS`. Os identificadores e exemplos desta etapa são sintéticos. O Data Studio é referência de reconciliação, não fonte operacional do painel.

| page | componentId | label | source | dateField | filter | groupBy | distinctBy | rawField | expectedValidation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ATENDIMENTO | atendimento.total | Total de atendimentos | Opa! Suite | a confirmar | a confirmar | nenhum | a confirmar | source_id | Validável somente após confirmar listagem, período, paginação e regra de atendimento único. |
| ATENDIMENTO | atendimento.protocolos | Protocolos | Opa! Suite | a confirmar | a confirmar | protocolo | protocolo | protocolo | Validável após confirmar se protocolo é identificador estável e qual campo de data representa o período. |
| ATENDIMENTO | atendimento.canal | Atendimentos por canal | Opa! Suite | a confirmar | a confirmar | canal | a confirmar | canal | Validável após confirmar dimensão, filtro e deduplicação na fonte. |
| ATENDIMENTO | atendimento.status | Atendimentos por status | Opa! Suite | a confirmar | a confirmar | status | a confirmar | status | Validável após confirmar domínio de status e tratamento de reabertura. |
| CANCELAMENTOS | cancelamentos.total | Total de cancelamentos | IXC | data_cancelamento | a confirmar | nenhum | source_id | source_id | Validável após confirmar endpoint, status de cancelamento e regra de evento. |
| CANCELAMENTOS | cancelamentos.motivo | Cancelamentos por motivo | IXC | data_cancelamento | a confirmar | motivo | source_id | motivo | Validável após confirmar catálogo de motivos e tratamento de nulos. |
| GERAL | geral.leads | Total de leads | Indique e Ganhe | reference_date | a confirmar | nenhum | source_id | source_id | Validável após confirmar janela e regra de contagem dos leads. |
| GERAL | geral.vendas | Total de vendas | IXC ou Indique e Ganhe | a confirmar | a confirmar | nenhum | a confirmar | source_id | Gate de fonte: origem e semântica ainda não confirmadas. |
| GERAL | geral.contratos | Total de contratos | IXC | data_ativacao | a confirmar | nenhum | source_id | source_id | Validável após confirmar definição de contrato ativo e data de referência. |

## Gates de fonte

Os componentes abaixo não recebem valor estimado nesta etapa:

- listagem histórica do Opa! Suite, incluindo filtros por período, paginação, limite e campo de atualização;
- endpoints IXC de clientes, contratos, vendas e cancelamentos que alimentam cada componente;
- semântica confirmada de data, status, atendimento único, deduplicação e agrupamento;
- regra de relação entre protocolo, cliente, contrato, lead e vendedor;
- fonte e regra de cálculo dos componentes compostos de `GERAL`.

Uma linha só pode mudar para validável quando a fonte e a regra puderem ser comprovadas por leitura autorizada e evidência sanitizada. Nenhum workflow, carga, agenda ou consulta remota foi executado para produzir este mapa.

## Estado da reconciliação

Todas as linhas permanecem `not_comparable` até que exista uma rodada autorizada com a mesma janela, timezone, filtros, regra de data e deduplicação no Data Studio e no painel. O PDF anexado foi usado somente como base de entendimento do escopo; seus números não foram promovidos a `expected` de produção.

A matriz e o procedimento de comparação estão em `docs/analytics/reconciliation-runbook.md`. Ausência de fonte, persistência ou evidência não é convertida em zero ou `match`.
