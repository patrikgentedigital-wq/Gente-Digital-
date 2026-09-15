# Workflow analítico OPA e IXC

**Workflow proposto:** `ANALYTICS - Sincronização OPA e IXC`
**Escopo:** ingestão server-side, somente leitura nas fontes, para a camada analítica do painel.
**Estado deste documento:** contrato local atualizado após a aplicação controlada do schema analítico, a configuração do draft de persistência e o primeiro upsert controlado. O workflow continua manual, sem publicação e sem agenda.

## Decisão operacional

O workflow existe separado do fluxo raiz de atendimento e permanece pausado. A rodada autorizada foi manual e controlada, com janela de `2026-09-01` a `2026-09-10`, timezone `America/Sao_Paulo` e leitura sem efeito transacional. Um `Schedule Trigger` só poderá ser acrescentado depois dos gates externos e da validação de paridade.

Workflow remoto do piloto: `ANALYTICS - Sincronização OPA e IXC`, ID `dqgBnd1OOci0T8A4`. O fluxo não foi publicado/ativado, não recebeu agenda e não alterou workflows existentes.

O fluxo raiz, `ATEND - Piloto`, workflows de ciclo de vida, subworkflows e automações transacionais ficam fora do escopo e não devem chamar este workflow. O resultado analítico não pode alterar atendimento, cliente, contrato, cancelamento ou qualquer outra fonte operacional.

## Correspondência com as três páginas

O Data Studio é usado apenas como referência de paridade. A sincronização não lê o relatório nem transforma os números do PDF ou de um snapshot em dados de produção. A camada analítica deverá alimentar as páginas abaixo somente depois de confirmar a fonte, a janela e a regra de contagem de cada componente.

| Página | Famílias de dados | Fonte prevista | Regra de disponibilidade |
| --- | --- | --- | --- |
| `GERAL` | leads, vendas e contratos | Indique e Ganhe e IXC, conforme o mapa de paridade | leads dependem da origem do Indique e Ganhe; vendas dependem da fonte e da data confirmadas; contratos dependem da definição de contrato ativo e `data_ativacao` |
| `ATENDIMENTO` | atendimentos, protocolos, canais e status | Opa! Suite | depende de listagem histórica, período, paginação, deduplicação por atendimento/protocolo e semântica dos campos confirmados |
| `CANCELAMENTOS` | total e agrupamento por motivo | IXC | depende de endpoint, evento de cancelamento, `data_cancelamento`, status e catálogo de motivos confirmados |

Quando uma família estiver sem fonte ou regra comprovada, a API e a interface devem manter o estado `unavailable` ou `partial`, conforme o contrato de proveniência. Não preencher com zero, valor do PDF, valor do Data Studio ou retorno de uma consulta unitária.

## Status das afirmações

| Classificação | Registro |
| --- | --- |
| **Confirmado** | O nome do workflow, a separação da operação, a necessidade de ingestão server-side, a preservação de `source_id`, a deduplicação antes do upsert e o estado limitado a `success`, `partial`, `failed` e `unavailable`. |
| **Confirmado** | Existe uma credencial n8n chamada `OPA Bearer`, que deve ser referenciada pelo node correspondente. O valor do token não faz parte deste documento, do workflow exportado, de fixtures, logs ou payloads de retorno. |
| **Confirmado** | A rota Opa! `GET /api/v1/atendimento` respondeu `200` no piloto com filtro pelo campo `date`. O limite efetivo observado foi `1.000` registros por página; `skip: 1.000` retornou mais `891` registros na mesma janela. Não houve total agregado confiável no envelope da resposta. |
| **Confirmado** | A rota IXC `POST /webservice/v1/cliente_contrato` respondeu no piloto com o campo `cliente_contrato.data_cancelamento`, status `I`, janela `2026-09-01` a `2026-09-10`, página `1` e `rp: 250`. O retorno informou `12` registros e `total: 12`. |
| **Condicionado** | A semântica do campo Opa! `date` ainda não foi provada como a mesma definição do Data Studio. A semântica de canais, reabertura, deduplicação e o vínculo com clientes continuam condicionados. |
| **Condicionado** | A origem IXC para o total `29` do Data Studio ainda não foi encontrada. O endpoint de contratos retornou `12`; o endpoint `su_ticket` não aceitou a filtragem temporal no piloto e não deve ser consultado em massa sem paginação e filtro posterior controlados. |
| **Bloqueado** | A paridade histórica completa continua bloqueada. O workflow não deve ser publicado, ativado ou agendado enquanto as divergências de fonte/regra não forem resolvidas. Novas cargas devem continuar manuais e controladas, com runtime e allow-list conferidos. |
| **Confirmado** | O draft remoto contém `FN - Preparar persistência` e `Supabase - Upsert lote analítico`, conectados depois do fechamento. O segundo node faz POST em lote por tabela, com upsert por conflito, perfis de schema dinâmicos, retry limitado e parada em caso de erro. |
| **Confirmado** | O desenho está salvo no workflow remoto e a primeira chamada de escrita controlada foi executada. A variável de runtime foi mantida fora do texto do node e a allow-list do Data API foi validada no ambiente do n8n. |

## Encadeamento isolado

```text
Trigger manual controlado
  -> FN - Janela piloto
  -> OPA - Lista atendimentos período (somente leitura, página limitada)
  -> FN - Resumo piloto (projeção sanitizada)
  -> IXC - Cancelamentos período (somente leitura, página observada)
  -> FN - Fechamento piloto (projeção sanitizada)
  -> FN - Preparar persistência
  -> Supabase - Upsert lote analítico (manual controlado, sem agenda/publicação)
```

O encadeamento representa etapas lógicas. Na configuração real, nodes com lógica reutilizável só devem virar subworkflows quando houver contrato estável, teste ou reutilização que justifique a fronteira. Cada subworkflow futuro deverá declarar entradas tipadas com `Execute Workflow Trigger` em `Define Below`, documentar entradas e saídas e retornar uma forma consistente. O fluxo analítico não deve extrair o fluxo raiz para dentro dele nem criar uma dependência operacional reversa.

## Contrato de entrada

O disparo manual ou agendado deve produzir um envelope equivalente a:

```json
{
  "periodStart": "YYYY-MM-DDTHH:mm:ss-03:00",
  "periodEnd": "YYYY-MM-DDTHH:mm:ss-03:00",
  "cursor": null,
  "requestId": "analytics-test-request-001",
  "timezone": "America/Sao_Paulo"
}
```

Contrato dos campos:

| Campo | Tipo | Regra |
| --- | --- | --- |
| `periodStart` | string ISO 8601 | Início inclusivo da janela. Deve ser validado antes de qualquer chamada externa. |
| `periodEnd` | string ISO 8601 | Fim da janela. Deve ser posterior ao início e ter o mesmo contexto de timezone definido para a execução. |
| `cursor` | string ou `null` | Cursor opaco devolvido pela fonte, somente se a paginação for comprovada. Não substituir por número de página sem contrato da API. |
| `requestId` | string | Identificador idempotente da execução solicitada. Deve ser único por tentativa lógica e persistido no sync run. |
| `timezone` | string | `America/Sao_Paulo` no contrato analítico, salvo decisão explícita e documentada. |

O workflow deve rejeitar janela inválida sem chamar Opa!, IXC ou Supabase. A janela, o cursor e o `requestId` devem ser registrados sem incluir headers de autenticação ou payload bruto.

## Contrato de saída

O resultado lógico de uma execução deve ser um envelope de estado, não uma cópia de respostas dos provedores:

```json
{
  "source": "opa|ixc",
  "status": "success|partial|failed|unavailable",
  "periodStart": "YYYY-MM-DDTHH:mm:ss-03:00",
  "periodEnd": "YYYY-MM-DDTHH:mm:ss-03:00",
  "nextCursor": null,
  "received": 0,
  "persisted": 0,
  "inserted": null,
  "updated": null,
  "failed": 0,
  "lastSourceUpdatedAt": null,
  "requestId": "analytics-test-request-001",
  "syncRunId": null,
  "errorCode": null
}
```

`inserted` e `updated` devem permanecer nulos quando o destino não fornecer metadado confiável para diferenciá-los. O workflow não pode converter `persisted` em duas contagens inventadas. `errorCode` é curto e sanitizado; não contém mensagem, token, header, URL autenticada, telefone, nome, protocolo ou payload do provedor.

O estado consultável deve ser persistido em `analytics_sync_status`, com histórico em `integration.sync_runs` conforme o contrato analítico do projeto. A saída deve apontar para a proveniência e contagens da execução, não devolver o corpo bruto recebido.

## Nodes e responsabilidades

### Trigger manual controlado ou Schedule pausado

- Manual durante a validação.
- Schedule criado, se necessário, com status pausado e timezone explícito.
- Não executar nesta etapa.
- Receber ou construir a janela e o cursor; gerar `requestId` antes das chamadas externas.

### OPA - Lista atendimentos período (somente leitura)

- Usar uma credencial n8n por referência. A credencial existente `OPA Bearer` é uma referência de configuração, nunca um valor a ser copiado para Set, Code, URL, nota, fixture ou export.
- A operação usada no piloto foi a rota de listagem `GET /api/v1/atendimento`, com filtro de `date` e `options.limit`.
- O limite de `1.000` e o deslocamento por `skip` foram observados, mas a paginação completa e o total de negócio do Data Studio ainda não foram confirmados.
- A consulta unitária por protocolo foi mantida como evidência histórica auxiliar, não como substituta da listagem.
- O node deve ser somente leitura e não deve enviar dados de atendimento de volta ao Opa!.

### OPA - Pagina resultados

- Continuar pelo cursor opaco fornecido pela fonte, respeitando limite e critério de parada documentados.
- Não inferir paginação por incremento de protocolo, timestamp ou número fixo de itens.
- Detectar cursor repetido, resposta sem avanço e limite máximo de segurança como falhas controladas, sem loop infinito.
- Esta etapa é **Condicionada** à confirmação da API de listagem.

### OPA - Normaliza atendimento

- Mapear apenas campos do contrato de `OpaAttendanceRecord` em `lib/analytics/types.ts`.
- Preservar o identificador bruto como texto em `source_id` e `contato_bruto` quando o campo for fornecido.
- Não transformar número bruto em nome de cliente e não preencher vínculo IXC por telefone, nome, protocolo ou proximidade temporal.
- Campos de data e status só podem ser mapeados depois de confirmar sua semântica na fonte.
- Registros sem chave estável devem seguir para falha de registro ou estado `partial`, nunca para um upsert com chave fabricada.

### IXC - Lista clientes/contratos/cancelamentos (somente leitura)

- Representa três famílias de registros: clientes, contratos e cancelamentos. Vendas só entram se o componente de `GERAL` tiver origem e regra confirmadas.
- Cada rota, método, filtro, paginação, campo de data, status e limite precisa ser confirmado no n8n e na documentação autorizada antes de criar qualquer node.
- O piloto confirmou `POST /webservice/v1/cliente_contrato` para a amostra de cancelamentos, com a credencial `IXC Basic Auth`, header padrão `ixcsoft` e corpo JSON de listagem.
- A amostra não fechou com o total `29` do Data Studio. A rota `su_ticket` foi inspecionada, mas sua filtragem temporal não foi validada; não usar essa rota como carga sem paginação, filtro posterior e projeção sanitizada.
- O node deve usar credencial server-side referenciada, com menor privilégio de leitura, sem token no texto do workflow.

### IXC - Normaliza registros

- Emitir linhas explícitas para `ixc_customers`, `ixc_contracts`, `ixc_sales` e `ixc_cancellations` somente quando a fonte correspondente estiver confirmada.
- Usar `source_id` textual estável; relações como `customer_source_id` e `contract_source_id` são opcionais e permanecem nulas até a chave e o significado serem comprovados.
- Manter datas de ativação, venda e cancelamento separadas. Não misturar competência, caixa e data de evento sem uma regra confirmada.

### Deduplica por source_id

- Deduplicar por entidade e `source_id` antes do upsert.
- Quando houver `source_updated_at` válido, manter deterministically o registro mais recente.
- Um conflito não pode ser resolvido por posição no lote, telefone, nome ou protocolo.
- A deduplicação deve ser idempotente para reprocessamento da mesma janela e cursor.

### Supabase - Upsert lote

- Persistir apenas rows normalizadas e explícitas, com `source_system`, `source_id`, `sync_run_id` e `synced_at`.
- Fazer upsert pela chave de origem `source_id`, respeitando RLS/grants e o cliente server-side autorizado.
- Lotes devem ter limite operacional definido antes da ativação. Falha de parte do lote deve ser contabilizada como `partial` ou `failed`, conforme o que foi persistido e o que ficou pendente.
- O node não deve receber nem registrar segredo, payload bruto ou PII além do que o contrato de armazenamento autorizar.

### Supabase - Registra sync run

- Criar o registro da execução com `requestId`, janela, fontes, contagens, cursor, `lastSourceUpdatedAt`, timestamps e estado.
- Atualizar `analytics_sync_status` de forma coerente com o resultado persistido.
- `success` exige que a etapa de persistência e o registro de estado tenham sido concluídos sem falha relevante e que as contagens conhecidas sejam coerentes.

### Falha controlada e estado partial/failed

- Nodes de rede e banco devem ter retry limitado para falhas transitórias, por exemplo `retryOnFail: true`, no máximo três tentativas e espera definida dentro do limite operacional do n8n.
- Retry não pode duplicar dados: `requestId`, `sync_run_id` e upsert por `source_id` devem tornar a repetição segura.
- Usar saídas de erro por node (`continueErrorOutput`) nos nodes que precisarem continuar para registrar estado. Toda saída deve terminar em um caminho explícito de estado, sem erro silencioso.
- O workflow deve apontar para um error workflow de nível de workflow antes de ser considerado apto para execução não assistida. Esse fluxo deve registrar somente metadados sanitizados, preservar o estado da execução e encaminhar a falha para o canal operacional autorizado; ele não deve expor payload, token ou PII.
- `partial`: parte das fontes, páginas ou registros foi persistida e a execução deixou pendência documentada.
- `failed`: a execução não produziu uma persistência confiável ou o registro do estado falhou.
- `unavailable`: a fonte necessária não tem rota/credencial/serviço disponível ou ainda está bloqueada por gate de confirmação; não significa zero registros.
- `success`: todas as etapas exigidas para a janela foram concluídas e confirmadas.
- Mensagens de erro devem ser sanitizadas. O erro de provedor pode ser usado internamente para diagnóstico, mas não deve ser copiado para saída pública, fixture ou documentação.

## Idempotência e cursor

O cursor pertence à fonte e deve ser tratado como opaco. O workflow registra o cursor de entrada e o `nextCursor` obtido, sem tentar reconstruí-lo. Um reprocessamento com o mesmo `requestId` deve ser detectado ou produzir o mesmo efeito lógico graças ao upsert por `source_id`.

O escopo da chave idempotente é, no mínimo, `requestId` para a execução e `source_system + source_id` para os registros. A janela não substitui a chave da origem. Se uma fonte alterar um registro, a versão com maior `source_updated_at` pode atualizar o destino; se a data não for confiável, o comportamento precisa ser definido antes da ativação.

## Fixture sanitizado estrutural

O fixture abaixo serve apenas para validar a forma do envelope e dos mappers. Os valores são marcadores artificiais. Não incluir nomes, telefones, protocolos, IDs reais, headers, tokens, URLs autenticadas ou payload bruto.

```json
{
  "input": {
    "periodStart": "2026-09-01T00:00:00-03:00",
    "periodEnd": "2026-09-02T00:00:00-03:00",
    "cursor": null,
    "requestId": "analytics-test-request-001",
    "timezone": "America/Sao_Paulo"
  },
  "opa": {
    "source_system": "opa",
    "source_id": "opa-test-attendance-001",
    "protocolo": "PROTOCOLO_TESTE_001",
    "contato_bruto": "ID_BRUTO_TESTE_001",
    "tipo_identificador": "unknown",
    "status_vinculo": "nao_vinculado",
    "data_referencia": "2026-09-01T10:00:00-03:00"
  },
  "ixc": {
    "source_system": "ixc",
    "source_id": "ixc-test-record-001",
    "record_type": "customer|contract|cancellation",
    "source_updated_at": "2026-09-01T12:00:00-03:00"
  },
  "output": {
    "status": "unavailable",
    "received": 0,
    "persisted": 0,
    "inserted": null,
    "updated": null,
    "failed": 0,
    "nextCursor": null,
    "errorCode": "source_list_endpoint_not_confirmed"
  }
}
```

O marcador `record_type` descreve a forma possível do fixture e não afirma que uma rota IXC foi localizada. O fixture Opa também não constitui prova de listagem: ele só permite testar a estrutura de normalização.

## Gates antes de publicação, ativação ou persistência

1. Confirmar, por inspeção autorizada, a rota de listagem Opa!, filtros de período, paginação, limite, ordenação e campo de atualização.
2. Confirmar os endpoints IXC de clientes, contratos, vendas e cancelamentos, suas permissões e seus campos de data/status.
3. Obter payloads sanitizados suficientes para validar os mappers contra `lib/analytics/types.ts`.
4. Confirmar as regras do Data Studio para data, status, deduplicação, agrupamento e vínculo opcional.
5. Confirmar que a janela de teste será curta, somente leitura nas fontes e persistirá apenas no destino autorizado.
6. Verificar a credencial correta em cada node na interface n8n. Referência de credencial não substitui essa verificação.
7. Configurar o error workflow de nível de workflow e conferir as saídas de erro dos nodes que podem falhar antes de qualquer execução não assistida.
8. Validar conexões e configurações sem publicar/ativar a agenda. O workflow deve permanecer pausado.
9. Antes de cada nova carga, confirmar que a migration do destino está aplicada, que o segredo existe apenas no runtime do n8n e que as tabelas necessárias estão na allow-list do Data API. A carga deve permanecer manual e controlada enquanto a paridade não estiver fechada.

Se uma nova inspeção perder a listagem histórica ou a paginação Opa!, o estado deve voltar a `unavailable`/`Bloqueado`. A criação ou execução manual do workflow não prova persistência, reconciliação ou paridade de dados.

## Rodada controlada de 10/09/2026

### Referência observada no Data Studio

O controle de data do relatório apareceu como `Período automático`, sem uma janela textual selecionada. A tabela de `ATENDIMENTO` exibiu registros de agosto, embora o relatório estivesse atualizado em `10/09/2026`. Portanto, os números abaixo são um snapshot de referência, não foram escritos no banco e não foram promovidos a dados de produção; a janela do Data Studio ainda não é comparável com a janela do piloto.

- `GERAL`: leads `239`, vendas `109`, contratos `95`, pré-contratos `5`.
- `ATENDIMENTO`: total `5.040`, clientes vinculados `2.232`, clientes não vinculados `9`; canais whatsapp `4.562`, pabx `469`, instagram `5`, telegram `4`.
- `CANCELAMENTOS`: total `29`; cartões de movimentação observados: renovações `24`, upgrade `10`, downgrade `1`, data de vencimento `1`.

A estrutura de `ATENDIMENTO` usa `DataInicio`, `DataAbertura`, `DataUltimaInteracao`, `Protocolo`, `Status`, `Motivo` e `Atendente`, com agrupamento de canais `whatsapp`, `pabx`, `instagram` e `telegram`. Isso aponta para a família de registros do Opa!, não para uma leitura direta de `su_ticket` do IXC. O workflow existente consulta `su_ticket` com status `OSAB` e tipo `C`, enquanto o relatório exibe status `F`; a equivalência entre essas regras não foi comprovada.

A página `CANCELAMENTOS` também exibe `ALTERAÇÃO DE CONTRATO` por `Tipo Alteração`, com códigos `UP`, `UV`, `AV`, `DV` e `DW`. O workflow existente contém uma leitura IXC do relatório de alterações de contrato. Essa é uma indicação de possível origem complementar, mas não prova a regra que produz o total `29` nem os cartões de movimentação.

### Leituras efetivas no piloto

- Opa!: `200` na primeira amostra inicial confirmou o filtro temporal usado no endpoint; com o limite efetivo de `1.000`, a primeira página retornou `1.000` e a página com `skip: 1.000` retornou `891`. A janela do primeiro lote observado foi de `2026-09-01T09:16:46.991Z` a `2026-09-10T15:33:06.377Z`. A amostra da primeira página foi `950` status `F` e `50` status `EA`, com canais `920` whatsapp e `80` pabx. Esses valores são de página, não o total da referência, e a equivalência com a janela automática do Data Studio não foi comprovada.
- IXC: `cliente_contrato.data_cancelamento` com status `I` retornou `12` de `12`, com datas observadas entre `2026-09-01` e `2026-09-08`. O total `12` não coincide com o cartão `29` do Data Studio.
- IXC `su_ticket`: uma tentativa com `qtype` temporal devolveu erro HTML do provedor; uma tentativa sem filtro temporal efetivo indicou `67.389` registros e foi interrompida como carga inadequada para o piloto. Nenhum desses retornos foi persistido.
- Supabase: não houve upsert. O nó final registrou `persistence.status = blocked` porque a migration analítica não estava aplicada no ambiente alvo.

Conclusão da rodada: o workflow remoto está tecnicamente separado e as credenciais referenciadas funcionam para leituras controladas, mas a paridade com os cartões `5.040` e `29` ainda está `not_comparable`. O formato dos campos aponta o atendimento para a família Opa! e indica uma possível leitura complementar de alterações no IXC, mas a janela automática e as regras de contagem ainda não estão fechadas. O sucesso da execução representa somente sucesso de leitura dos nodes, não paridade de negócio.

### Conferência posterior do período no Data Studio

Foi aplicada uma janela somente de visualização, `01/09/2026` a `10/09/2026`, nas páginas `ATENDIMENTO` e `CANCELAMENTOS`. Após a coleta dos números, o relatório foi redefinido para `Selecionar período`/`Período automático`; não houve edição, salvamento, publicação ou alteração de compartilhamento.

- `ATENDIMENTO`: total `1.918`; vinculados `1.121`; não vinculados `4`; anúncios `39`; canais whatsapp `1.773`, pabx `141` e telegram `4`.
- `CANCELAMENTOS`: total `12`; renovações `7`, upgrade `3`, downgrade `1` e data de vencimento `1`.
- O total `12` de cancelamentos coincide numericamente com o retorno IXC de `cliente_contrato.data_cancelamento`, status `I`, `total:12`, para a mesma janela. Isso é uma evidência de alinhamento do total, não confirmação da regra completa dos motivos e cartões.
- O atendimento não fecha ainda: a leitura Opa! anterior observou `1.891` itens paginados, enquanto o Data Studio mostrou `1.918`. O lote Opa! terminou em `2026-09-10T15:33:06.377Z`; a diferença de `27` pode decorrer do corte horário do dia 10, além de métrica distinta ou deduplicação. A hipótese precisa ser testada com uma nova leitura até o mesmo limite do relatório.

Essa rodada mudou o diagnóstico do período: os cartões `5.040` e `29` pertencem ao estado automático do relatório, e não devem ser usados como expectativa de uma janela parcial sem registrar essa condição. A paridade permanece `not_comparable` para o atendimento e para os demais indicadores até repetir Opa!, validar o campo temporal e fechar a métrica `Protocolo`.

## Diagnóstico controlado de 14/09/2026

Foi repetida a leitura remota controlada na janela explícita `2026-09-01` a `2026-09-10`, com `period_start_ts` em `2026-09-01T00:00:00-03:00`, `period_end_ts` em `2026-09-10T23:59:59-03:00` e timezone `America/Sao_Paulo`. O workflow continuou manual, sem agenda, publicação, ativação ou escrita no Supabase.

### Resultado do comportamento de redirects

- Com `Follow Redirects` ligado, a execução do workflow parou no node Opa! em `ERR_FR_TOO_MANY_REDIRECTS`, antes de alcançar o node IXC. Esse erro comprova uma falha de transporte/configuração nessa combinação, mas não prova se a causa está no endpoint, proxy, autenticação ou tratamento de redirects do cliente.
- Em uma execução diagnóstica do node, sem seguir redirects, a página `skip: 0`, `limit: 1.000` respondeu `200` e exibiu uma coleção de atendimentos no campo `data`.
- A mesma execução diagnóstica, sem seguir redirects, com `skip: 1.000` também respondeu `200` e exibiu uma coleção não vazia no campo `data`. O envelope não apresentou um total agregado confiável; portanto, essa rodada confirma a disponibilidade de duas páginas, não o número final de atendimentos.
- O corpo usado nas duas chamadas manteve o filtro por `date` e a janela inclusiva acima. Não foram registrados payloads brutos, credenciais, headers ou identificadores de registros na documentação.

Ao encerrar a inspeção, o formulário do node foi restaurado para `skip: 0`, `limit: 1.000` e `Follow Redirects` ligado. O botão `Publish` não foi acionado. A opção sem redirects é apenas uma hipótese diagnóstica e não deve ser promovida como correção de produção sem verificar o comportamento HTTP e os efeitos de autenticação no endpoint.

### Estado após a rodada

- `Confirmado`: o endpoint de listagem Opa! responde `200` para as duas páginas testadas quando o cliente não segue redirects.
- `Confirmado`: a execução normal com redirects ligados falha antes do IXC, então não houve nova leitura IXC nem persistência nessa execução completa.
- `Condicionado`: a causa do loop de redirects e a configuração permanente correta ainda não foram identificadas.
- `Bloqueado`: a contagem completa, a deduplicação, a equivalência com `1.918` e a paridade dos demais indicadores continuam sem prova atualizada.
- `Proposto`: fazer uma próxima leitura com projeção sanitizada de contagem por página e metadados HTTP mínimos, mantendo a consulta sem persistência; só depois decidir entre corrigir a URL/proxy, manter redirects desligados ou tratar a paginação em um node próprio.

## Correção controlada aplicada em 14/09/2026

O node `OPA - Lista atendimentos período` foi ajustado no workflow analítico isolado para não seguir redirects. A execução manual completa foi repetida sem alterar os workflows operacionais e terminou com sucesso nos nodes de janela, Opa!, resumo, IXC e fechamento.

O fechamento sanitizado registrou `1.000` linhas Opa!, `reported_total: null`, cobertura `limited_at_1000`, status `F:953` e `EA:47`, com canais `whatsapp:920` e `pabx:80`. No IXC, a consulta de contratos cancelados registrou `12` linhas e `total:12`. A persistência permaneceu `blocked` porque a migration do Supabase não foi aplicada.

Essa correção resolve o erro de redirects observado na execução, mas não resolve a paginação completa. O próprio fechamento confirma que o workflow atual ainda cobre somente a primeira página Opa!. A configuração foi testada no workflow isolado, o botão `Publish` não foi acionado e não houve ativação de agenda.

## Correção controlada da paginação em 14/09/2026

Depois da correção de transporte, a paginação foi testada primeiro com `Body` e nome `options.skip`. O node executou três requisições, porém repetiu a mesma página. O resumo sanitizado identificou `3.000` linhas brutas, `1.000` distintas e `2.000` duplicadas. A configuração foi então corrigida para atualizar o objeto `options` inteiro, usando o valor em modo de expressão `{{ ({ limit: 1000, skip: $pageCount * 1000 }) }}`. Essa forma preserva o filtro e aplica o deslocamento no corpo efetivamente enviado.

O node `OPA - Lista atendimentos período` ficou com a paginação nativa `Update a Parameter in Each Request`, tipo `Body`, nome `options`, limite de `1.000` por página, expressão de deslocamento baseada em `$pageCount`, parada quando `data.length < 1000`, teto de `20` páginas, intervalo de `0` ms e `Follow Redirects` desligado. O node `FN - Resumo piloto` foi ajustado para consumir todas as entradas de página com `$input.all()`, deduplicar registros com `_id` e registrar `raw_returned_rows`, `returned_rows`, `duplicate_rows`, `pages_fetched`, `page_lengths` e `coverage`.

### Evidência da execução completa

- `Confirmado`: workflow manual concluído com sucesso nos nodes de janela, Opa!, resumo, IXC e fechamento.
- `Confirmado`: Opa! retornou `2.003` linhas brutas e distintas, sem duplicidade, em `3` páginas com tamanhos `[1.000, 1.000, 3]`; o envelope continuou sem `reported_total` confiável.
- `Confirmado`: o resumo Opa! registrou status `F:1.933` e `EA:70`, e canais `whatsapp:1.851`, `pabx:148` e `telegram:4`.
- `Confirmado`: IXC retornou `12` contratos cancelados, com `total:12`, para `data_cancelamento` entre `01/09/2026` e `08/09/2026`.
- `Condicionado`: `2.003` não é considerado equivalente ao total `1.918` do Data Studio. A diferença de `85` ainda depende de métrica, campo de data, corte horário e deduplicação equivalentes.
- `Bloqueado`: persistência no Supabase permanece bloqueada pela migration não aplicada; publicação, agenda e ativação não foram feitas.

Esta rodada corrige a paginação técnica e o consumo de múltiplas páginas no resumo. Ela ainda não autoriza carga de produção, não prova paridade de negócio e não substitui a validação do corte efetivo do Data Studio.

## Correção de persistência e contrato do painel em 15/09/2026

Após a aplicação da migration analítica, foi executada uma nova rodada manual do workflow remoto, ainda sem publicação ou agenda. O node `FN - Preparar persistência` passou a usar `period_start_ts` e `period_end_ts` na persistência, preservando o limite final inclusivo de `2026-09-10T23:59:59-03:00`. O identificador bruto `id_cliente` do Opa! é mantido em `contato_bruto` com `tipo_identificador: client_id` quando existe. Isso preserva a informação recebida sem afirmar que ela já é uma chave de relacionamento com o IXC.

### Evidência remota da rodada

- `Confirmado`: o último estado persistido do Opa! terminou com `success`, `received: 2.003` e `inserted: 2.003`.
- `Confirmado`: o último estado persistido do IXC terminou com `success`, `received: 12` e `inserted: 12`.
- `Confirmado`: a janela persistida usa `2026-09-01T00:00:00-03:00` até `2026-09-10T23:59:59-03:00`. Os estados anteriores com limite final incorreto foram mantidos como histórico e não vencem o estado mais recente.
- `Confirmado`: a tabela analítica do Opa! contém `2.003` atendimentos na carga atual; `1.677` têm `id_cliente` bruto preservado.
- `Confirmado`: a aplicação agora pagina a leitura do Supabase e não converte vínculo não calculado em zero. Quando a classificação não pode ser comprovada para toda a carga, os cartões de vínculo ficam indisponíveis.
- `Bloqueado`: a relação entre o `id_cliente` bruto do Opa! e um cliente ou contrato do IXC ainda não foi comprovada. A carga atual do IXC não contém a lista de clientes necessária para essa validação.

Essa rodada corrige a perda de páginas, o limite temporal persistido e a apresentação enganosa de métricas de vínculo. Ela não transforma a leitura Opa! em paridade automática com o Data Studio, porque a diferença de métrica e de fonte continua sem prova.

## Estado atual da implementação em 15/09/2026

- `Confirmado`: a migration `create_analytics_sources` está aplicada no projeto Supabase alvo. A verificação remota encontrou as 10 tabelas novas com RLS habilitado; o piloto persistiu `2.003` registros Opa!, `12` registros IXC e `2` estados de sincronização.
- `Confirmado`: o workflow remoto `ANALYTICS - Sincronização OPA e IXC` continua manual, não publicado e sem agenda. O botão `Publish` não foi acionado.
- `Confirmado`: `FN - Preparar persistência` produz sete lotes: dois `integration.sync_runs`, raw Opa!, atendimento Opa!, raw IXC, cancelamentos IXC e dois estados em `public.analytics_sync_status`.
- `Confirmado`: `Supabase - Upsert lote analítico` usa `POST /rest/v1/{{$json.table}}?on_conflict={{$json.conflict}}`, os headers de perfil são derivados do schema do lote e a autorização usa uma credencial Custom Auth dedicada no runtime do n8n. O node tem três tentativas e espera de `5.000` ms. O piloto confirmou `12` linhas IXC recebidas e inseridas, além de `2.003` linhas Opa! recebidas e inseridas.
- `Condicionado`: a carga atual do IXC cobre cancelamentos. Vendas e contratos ainda não têm uma rota de ingestão confirmada neste workflow e permanecem como `—` no `GERAL`, sem conversão para zero.
- `Confirmado`: a credencial de runtime do piloto foi configurada sem inserir o segredo no texto do node, e o schema `integration` e as tabelas necessárias foram expostos no Data API. A carga controlada foi executada e os contadores persistidos foram conferidos no destino.
- `Condicionado`: a chave legada de serviço do projeto Supabase ainda precisa ser inventariada e rotacionada separadamente. Ela não foi usada no novo node do piloto e nenhum valor de segredo deve entrar neste documento.
- `Bloqueado`: a diferença observada de `85` registros entre a leitura paginada Opa! (`2.003`) e o Data Studio (`1.918`) continua sem causa comprovada. Isso impede declarar paridade de `ATENDIMENTO`, mesmo que a infraestrutura de persistência esteja pronta para o teste controlado.

## Carga isolada das dimensões IXC em 15/09/2026

As dimensões de clientes e contratos foram retiradas do workflow principal porque manter as duas respostas completas na mesma execução provocou esgotamento de memória no n8n. Elas passaram a ser carregadas por workflows manuais separados, com a mesma credencial IXC e persistência em lotes:

- `ANALYTICS - IXC Clientes dimensão` (`YtN1uxlvx0VKKkvE`): leitura confirmada com `total: 12.023`; a execução terminou como `Succeeded` e persistiu 12.023 clientes normalizados e seus registros brutos restritos.
- `ANALYTICS - IXC Contratos dimensão` (`MiRLaMPLm8zVy3JX`): leitura confirmada com `total: 12.287`; a primeira persistência com lotes de 250 encontrou `statement timeout` no Supabase. O lote foi reduzido para 50 e a nova execução terminou como `Succeeded`, com `received: 12.287`, `inserted: 12.287` e 493 operações de upsert concluídas.
- `ANALYTICS - Sincronização OPA e IXC` (`dqgBnd1OOci0T8A4`): os nós de dimensão foram removidos do encadeamento. A nova execução leve terminou como `Succeeded` em 16,438 s, com Opa! `received: 2.003`, IXC cancelamentos `received: 12` e upsert concluído.

Os três workflows continuam manuais, sem agenda e sem publicação. As tabelas normalizadas de clientes e contratos guardam somente os campos mínimos previstos no contrato analítico; o payload bruto fica restrito à camada `integration`. A presença das dimensões não comprova, por si só, que o identificador bruto do Opa! corresponde a um cliente ou contrato específico do IXC. Os cartões de vínculo continuam indisponíveis até essa chave ser validada.

## Limites e não objetivos

- Não editar workflows transacionais ou subworkflows existentes.
- Não publicar, ativar ou agendar o workflow remoto nesta etapa.
- Não publicar, ativar ou agendar o workflow nesta etapa.
- Executar novas cargas somente em rodada manual controlada, com chave de runtime, allow-list do Data API, janela e evidência registrados.
- Não ativar agenda, testar envio ou consultar fontes pelo navegador.
- Não inventar endpoint IXC, parâmetro de paginação, nome de campo ou chave de relacionamento.
- Não expor segredo, token, header Bearer, PII, protocolo real ou ID real em documentação, export, logs ou fixture.
- Não considerar HTTP 200, workflow presente na interface ou retorno de uma chamada unitária como prova de ingestão ou paridade.

## Referências internas

- `lib/analytics/types.ts`: tipos dos registros normalizados.
- `docs/analytics/database-contract.md`: tabelas, proveniência, estados e regras de `source_id`.
- `docs/analytics/data-studio-parity-map.md`: componentes e gates de fonte.
- `docs/superpowers/specs/2026-09-10-data-parity-opa-ixc-design.md`: especificação e limites da arquitetura.
