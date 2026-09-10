# Workflow analítico OPA e IXC

**Workflow proposto:** `ANALYTICS - Sincronização OPA e IXC`
**Escopo:** ingestão server-side, somente leitura nas fontes, para a camada analítica do painel.
**Estado deste documento:** definição local do contrato. Nenhum workflow remoto foi criado, configurado, executado, publicado ou alterado nesta tarefa.

## Decisão operacional

O workflow deve existir separado do fluxo raiz de atendimento e permanecer pausado. A primeira execução, quando autorizada em tarefa própria, será manual e controlada. Um `Schedule Trigger` poderá ser acrescentado apenas depois dos gates externos e da validação de uma janela pequena de leitura.

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
| **Confirmado** | A evidência independente disponível demonstra uma consulta Opa! unitária por protocolo. Ela não demonstra uma rota de listagem histórica, seus filtros, paginação, limite ou cursor. |
| **Condicionado** | A rota de listagem Opa!, a paginação, os campos de atualização e os endpoints IXC de clientes, contratos, vendas e cancelamentos só podem entrar na configuração após inspeção autorizada da configuração e da documentação da respectiva fonte. |
| **Bloqueado** | Não é permitido ativar ou executar a sincronização histórica enquanto a listagem/paginação Opa! não estiver comprovada e enquanto as rotas IXC não forem confirmadas. Não se deve transformar a consulta por protocolo em uma listagem estimada. |
| **Proposto** | O encadeamento e os contratos abaixo são o desenho para a configuração futura. Eles não são evidência de que as rotas ou os campos já estejam disponíveis no n8n. |

## Encadeamento isolado

```text
Trigger manual controlado ou Schedule pausado
  -> OPA - Lista atendimentos (somente leitura)
  -> OPA - Pagina resultados
  -> OPA - Normaliza atendimento
  -> IXC - Lista clientes/contratos/cancelamentos (somente leitura)
  -> IXC - Normaliza registros
  -> Deduplica por source_id
  -> Supabase - Upsert lote
  -> Supabase - Registra sync run
  -> Falha controlada e estado partial/failed
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

### OPA - Lista atendimentos (somente leitura)

- Usar uma credencial n8n por referência. A credencial existente `OPA Bearer` é uma referência de configuração, nunca um valor a ser copiado para Set, Code, URL, nota, fixture ou export.
- A operação precisa ser uma rota de listagem documentada, com filtros de período, limite, campo de ordenação/atualização e paginação comprovados.
- A consulta unitária observada por protocolo não satisfaz esse contrato. Enquanto a rota de listagem não for confirmada, este node fica **Bloqueado** para configuração e execução.
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
- Nenhum endpoint IXC é nomeado aqui porque ainda não há evidência suficiente. O caminho não pode ser inventado a partir de nomes de tabelas ou de uma integração semelhante.
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

## Gates antes de qualquer configuração ou execução

1. Confirmar, por inspeção autorizada, a rota de listagem Opa!, filtros de período, paginação, limite, ordenação e campo de atualização.
2. Confirmar os endpoints IXC de clientes, contratos, vendas e cancelamentos, suas permissões e seus campos de data/status.
3. Obter payloads sanitizados suficientes para validar os mappers contra `lib/analytics/types.ts`.
4. Confirmar as regras do Data Studio para data, status, deduplicação, agrupamento e vínculo opcional.
5. Confirmar que a janela de teste será curta, somente leitura nas fontes e persistirá apenas no destino autorizado.
6. Verificar a credencial correta em cada node na interface n8n. Referência de credencial não substitui essa verificação.
7. Configurar o error workflow de nível de workflow e conferir as saídas de erro dos nodes que podem falhar antes de qualquer execução não assistida.
8. Validar conexões e configurações sem executar a carga. O workflow deve permanecer pausado.

Se a inspeção encontrar apenas a consulta unitária Opa! por protocolo, a configuração deve parar no gate 1 e o estado permanece `unavailable`/`Bloqueado`. A criação de um workflow na interface não prova listagem, persistência, reconciliação ou paridade de dados.

## Limites e não objetivos

- Não editar workflows transacionais ou subworkflows existentes.
- Não configurar, publicar, ativar ou executar workflow remoto nesta tarefa.
- Não ativar agenda, fazer carga real, testar envio ou consultar fontes pelo navegador.
- Não inventar endpoint IXC, parâmetro de paginação, nome de campo ou chave de relacionamento.
- Não expor segredo, token, header Bearer, PII, protocolo real ou ID real em documentação, export, logs ou fixture.
- Não considerar HTTP 200, workflow presente na interface ou retorno de uma chamada unitária como prova de ingestão ou paridade.

## Referências internas

- `lib/analytics/types.ts`: tipos dos registros normalizados.
- `docs/analytics/database-contract.md`: tabelas, proveniência, estados e regras de `source_id`.
- `docs/analytics/data-studio-parity-map.md`: componentes e gates de fonte.
- `docs/superpowers/specs/2026-09-10-data-parity-opa-ixc-design.md`: especificação e limites da arquitetura.
