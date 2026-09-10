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

O campo Opa! `date` e a paginação por `skip` são evidências de capacidade técnica do endpoint, não confirmação de que a dimensão usada no relatório seja a mesma. O total exibido pelo painel analítico do Opa! também não foi tratado como equivalente ao total `5.040`, pois representa outra definição operacional. A próxima validação deve fixar uma janela explícita no Data Studio ou obter sua configuração de fonte, e então comparar o campo de data, a métrica `Protocolo`, o status e a deduplicação antes de mudar qualquer linha para `match`.
