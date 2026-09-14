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

Uma linha só pode mudar para validável quando a fonte e a regra puderem ser comprovadas por leitura autorizada e evidência sanitizada. A matriz inicial foi criada antes do piloto; a rodada posterior está registrada abaixo e não altera automaticamente o estado das linhas.

## Estado da reconciliação

Todas as linhas permanecem `not_comparable` até que exista uma rodada autorizada com a mesma janela, timezone, filtros, regra de data e deduplicação no Data Studio e no painel. O PDF anexado foi usado somente como base de entendimento do escopo; seus números não foram promovidos a `expected` de produção.

A matriz e o procedimento de comparação estão em `docs/analytics/reconciliation-runbook.md`. Ausência de fonte, persistência ou evidência não é convertida em zero ou `match`.

## Rodada autorizada de leitura

Em `10/09/2026`, foi executado manualmente o workflow remoto isolado `ANALYTICS - Sincronização OPA e IXC` (ID `dqgBnd1OOci0T8A4`), sem publicação, agenda ou escrita no Supabase. A janela do piloto foi `2026-09-01` a `2026-09-10`, timezone `America/Sao_Paulo`. Essa janela não foi comprovada como a mesma janela do Data Studio.

### Snapshot do Data Studio

| Página | Indicadores observados |
| --- | --- |
| `GERAL` | leads `239`, vendas `109`, contratos `95`, pré-contratos `5` |
| `ATENDIMENTO` | total `5.040`, vinculados `2.232`, não vinculados `9`; canais whatsapp `4.562`, pabx `469`, instagram `5`, telegram `4` |
| `CANCELAMENTOS` | total `29`; cartões de movimentação renovações `24`, upgrade `10`, downgrade `1`, data de vencimento `1` |

### Evidência das fontes consultadas

| Fonte e regra testada | Resultado sanitizado | Estado de paridade |
| --- | --- | --- |
| Opa! `GET /api/v1/atendimento`, filtro pelo campo `date`, `limit: 1.000`, `skip: 0` | `1.000` registros, status `F:950` e `EA:50`, canais `whatsapp:920` e `pabx:80` | `partial`; não representa os `5.040` sem paginação completa, janela equivalente e regra confirmada |
| Opa! mesma consulta com `skip: 1.000` | `891` registros adicionais observados | `partial`; não há total de negócio confiável no envelope |
| IXC `cliente_contrato.data_cancelamento`, status `I`, `rp:250` | `12` registros, `total:12`, datas observadas de `01/09` a `08/09` | `not_comparable` com o cartão `29` |
| IXC `su_ticket` | filtro temporal não validado; sem janela efetiva o universo observado foi `67.389` e não foi usado no piloto | `blocked` para carga até definir paginação e filtro posterior |

## Evidência adicional de fonte e período

Na leitura do relatório, o controle de data apareceu como `Período automático`, sem expor uma janela textual selecionada. A tabela de `ATENDIMENTO` exibiu registros de agosto, embora o relatório estivesse atualizado em `10/09/2026`; por isso, o snapshot `5.040` não pode ser comparado diretamente com a janela `01/09/2026` a `10/09/2026` do piloto.

A estrutura da página `ATENDIMENTO` confirma uma família de dados compatível com o Opa!: a tabela usa `DataInicio`, `DataAbertura`, `DataUltimaInteracao`, `Protocolo`, `Status`, `Motivo` e `Atendente`, e os agrupamentos exibem canais `whatsapp`, `pabx`, `instagram` e `telegram`. Isso indica que `su_ticket` do IXC não deve ser usado como substituto direto. No workflow existente, `su_ticket` é consultado com status `OSAB` e tipo `C`, enquanto a tabela do Data Studio exibe status `F`; qualquer conversão entre os domínios ainda precisa ser comprovada.

Na página `CANCELAMENTOS`, o relatório também mostra `ALTERAÇÃO DE CONTRATO` com a dimensão `Tipo Alteração` e códigos de movimentação como `UP`, `UV`, `AV`, `DV` e `DW`. O workflow existente possui uma leitura IXC de relatório de alterações de contrato, o que indica uma possível segunda origem para esses cartões, mas ainda não prova que ela seja a fonte do total `29` ou dos agrupamentos por motivo.

O campo Opa! `date` e a paginação por `skip` são evidências de capacidade técnica do endpoint, não confirmação de que a dimensão usada no relatório seja a mesma. O total exibido pelo painel analítico do Opa! também não foi tratado como equivalente ao total `5.040`, pois representa outra definição operacional. A próxima validação deve repetir a leitura Opa! com a mesma janela explícita e o mesmo corte final observado no Data Studio, comparando o campo de data, a métrica `Protocolo`, o status e a deduplicação antes de mudar qualquer linha para `match`.

## Conferência controlada com janela explícita

Em `10/09/2026`, foi aplicada somente na visualização do Data Studio a janela `01/09/2026` a `10/09/2026`, timezone exibido pelo relatório, nas páginas `ATENDIMENTO` e `CANCELAMENTOS`. Depois da leitura, o filtro foi redefinido e as duas páginas voltaram a `Selecionar período`/`Período automático`; nenhuma configuração do relatório foi salva.

| Página | Resultado na janela explícita | Comparação disponível |
| --- | --- | --- |
| `ATENDIMENTO` | total `1.918`; vinculados `1.121`; não vinculados `4`; anúncios `39`; canais whatsapp `1.773`, pabx `141`, telegram `4` | o total é o novo esperado observável para essa janela; ainda precisa ser confrontado com a mesma janela e o mesmo corte temporal no Opa! |
| `CANCELAMENTOS` | total `12`; renovações `7`, upgrade `3`, downgrade `1`, data de vencimento `1` | o total `12` coincide numericamente com a leitura IXC de `cliente_contrato.data_cancelamento`, status `I`, `total:12`; a coincidência não prova sozinha a regra completa dos cartões ou dos motivos |

Essa conferência confirma que o controle de data é funcional e que os valores `5.040` e `29` eram resultados do modo automático, não uma janela comprovadamente equivalente ao piloto. A leitura Opa! anteriormente observada somou `1.891` registros (`1.000` mais `891` adicionais), mas o lote terminou em `2026-09-10T15:33:06.377Z`; como a janela do relatório inclui o dia 10, a diferença de `27` permanece condicionada ao corte horário, à definição da métrica e à deduplicação. É necessário repetir a leitura Opa! até o mesmo limite final do relatório antes de classificar a linha como `match`.

## Nova rodada controlada do Opa! em 14/09/2026

O workflow remoto isolado foi executado manualmente com a mesma janela explícita, `01/09/2026` a `10/09/2026`, timezone `America/Sao_Paulo`, sem agenda, publicação, ativação ou escrita no Supabase.

| Consulta | Resultado sanitizado | Estado de paridade |
| --- | --- | --- |
| Opa! `GET /api/v1/atendimento`, `limit: 1.000`, `skip: 0`, `Follow Redirects` ligado | execução interrompida por `ERR_FR_TOO_MANY_REDIRECTS` no node Opa!, antes do IXC | `blocked` para a execução normal |
| Opa! mesma rota, `skip: 0`, `Follow Redirects` desligado | HTTP `200`; coleção de atendimentos presente no campo `data`; sem total agregado confiável no envelope | `partial`; confirma leitura da página, não a contagem final |
| Opa! mesma rota, `skip: 1.000`, `Follow Redirects` desligado | HTTP `200`; coleção não vazia presente no campo `data`; sem total agregado confiável no envelope | `partial`; confirma uma segunda página, não o total `1.918` |

O corpo das consultas manteve `date >= 2026-09-01T00:00:00-03:00` e `date <= 2026-09-10T23:59:59-03:00`. O toggle e o deslocamento foram restaurados na interface ao final da inspeção e o workflow não foi publicado. A diferença entre a configuração com redirects ligados e desligados é um bloqueio de transporte/configuração ainda não explicado; não deve ser convertida diretamente em alteração permanente.

Essa rodada aumenta a evidência de que a listagem Opa! é tecnicamente acessível e paginável por `skip`, mas não fecha a reconciliação. A próxima leitura precisa devolver somente contagens e metadados sanitizados por página, confirmar o critério de parada e comparar a métrica de linhas com `Protocolo` distinto antes de avaliar a equivalência com `1.918`.

## Correção do transporte e teste completo

No workflow analítico isolado, `Follow Redirects` foi desligado no node Opa! para eliminar o loop observado. A execução manual seguinte terminou com sucesso em todos os nodes, incluindo a consulta IXC e o fechamento sanitizado.

| Resultado do teste | Evidência | Limite |
| --- | --- | --- |
| Transporte Opa! | execução completa sem `ERR_FR_TOO_MANY_REDIRECTS` | a correção ainda está restrita ao workflow isolado e não foi publicada |
| Opa! | `returned_rows: 1.000`, `reported_total: null`, `coverage: limited_at_1000`; status `F:953` e `EA:47`; canais `whatsapp:920` e `pabx:80` | somente a primeira página foi consumida |
| IXC | `returned_rows: 12`, `reported_total: 12`, `coverage: observed` | confirma a leitura da consulta de contratos cancelados, não todos os cartões do Data Studio |
| Persistência | `status: blocked` | migration analítica do Supabase ainda não aplicada |

A correção elimina o erro de transporte no piloto, mas a linha `ATENDIMENTO` permanece `partial` e `not_comparable` com `1.918`. A próxima alteração deve tratar a paginação e a contagem sanitizada antes de qualquer publicação ou persistência.
