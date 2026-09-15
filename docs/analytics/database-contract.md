# Contrato do banco analítico

Este documento define o contrato da camada de proveniência de Opa! Suite e IXC. A migration local foi criada em `supabase_migration_analytics_sources.sql` e aplicada no projeto Supabase autorizado em `14/09/2026` por uma operação remota controlada. A CLI `supabase`, o Docker e um Postgres local continuam indisponíveis neste worktree, portanto `supabase db reset` não foi executado.

## Estado da entrega

- **Confirmado:** a migration criou as 10 tabelas analíticas previstas, habilitou RLS em todas elas, manteve `anon` e `authenticated` sem acesso direto e concedeu acesso somente a `service_role` nas tabelas novas. A verificação remota confirmou as tabelas, colunas, unicidades e checks de estado. Depois do piloto controlado, foram persistidos `2.003` registros brutos e projetados do Opa!, `12` registros brutos e projetados do IXC e `2` estados de sincronização.
- **Confirmado:** o payload bruto permanece em `integration.*`; as projeções normalizadas ficam em `public.*`; nenhuma policy de leitura permissiva foi criada.
- **Bloqueado:** executar `supabase db reset` e as asserções contra Postgres local, pois a CLI e o Docker não estão disponíveis neste ambiente.
- **Confirmado:** o schema `integration` e as tabelas `public.*` usadas pelo fluxo foram expostos no allow-list do Data API para o endpoint REST usado pelo n8n. Essa exposição foi conferida no ambiente e não é concedida pela migration.

## Camadas e regras comuns

As tabelas `integration.*` são internas. Elas guardam o payload bruto e metadados de ingestão para reprocessamento e auditoria. Não devem ser expostas pelo Data API a `anon` ou `authenticated`.

As tabelas `public.*` são projeções normalizadas para consulta analítica. Todas devem ter RLS habilitado. Nenhuma política de leitura pública é presumida neste contrato; as policies e grants só podem ser adicionadas quando o modelo de acesso server-side estiver definido. A marcação de exposição no manifesto indica somente que o schema público pode estar na allow-list do Data API; ela não concede leitura às roles negadas abaixo.

Todas as entidades de origem usam:

- `id uuid` como identificador interno, quando aplicável;
- `source_system text not null` para registrar a origem da projeção. Nas tabelas normalizadas, o valor permitido é `opa` para `opa_attendances` e `opa_interactions`, e `ixc` para `ixc_customers`, `ixc_contracts`, `ixc_sales` e `ixc_cancellations`;
- `source_id text not null unique` como chave estável recebida da origem;
- `source_updated_at timestamptz` para o cursor ou ordenação incremental, quando a origem fornecer esse campo;
- `synced_at timestamptz not null default now()`;
- `sync_run_id uuid` opcional para proveniência da execução;
- chaves de relação text nullable com sufixo `_source_id`, sem inferência por contato, nome ou posição do registro.

Valores de identificadores brutos continuam texto. A normalização não converte números em `number`, não remove zeros à esquerda e não transforma contato em nome de cliente.

## Tabelas de integração

| Tabela | Finalidade | Chave da origem | Campos de data | Payload bruto | Retenção e acesso |
| --- | --- | --- | --- | --- | --- |
| `integration.opa_records_raw` | Preservar cada registro recebido do Opa! Suite para reprocessamento e auditoria. | `source_id` da origem, com `source_system` e `record_type` no envelope. | `source_updated_at`, `received_at`. | `payload jsonb` e metadados técnicos, sem segredo ou credencial. | Retenção operacional definida antes da primeira carga. Schema interno, acesso apenas pelo processo server-side autorizado. |
| `integration.ixc_records_raw` | Preservar registros recebidos do IXC antes da projeção normalizada. | `source_id` da origem, com `source_system` e `record_type` no envelope. | `source_updated_at`, `received_at`. | `payload jsonb` e metadados técnicos, sem segredo ou credencial. | Retenção operacional definida antes da primeira carga. Schema interno, acesso apenas pelo processo server-side autorizado. |
| `integration.sync_runs` | Registrar uma execução por fonte, janela e request idempotente. | `request_id` deve ser único por execução lógica. | `period_start`, `period_end`, `started_at`, `finished_at`, `last_source_updated_at`. | Somente contagens, estado e erro sanitizado; nunca payload bruto. | Retenção de auditoria definida com a operação. Schema interno, acesso server-side. |

O payload bruto não deve ser duplicado nas tabelas `public.*`. Campos derivados podem carregar apenas o valor necessário para consulta, mantendo o campo original quando a proveniência exigir.

As tabelas normalizadas públicas mantêm `source_system` mesmo quando a origem já está implícita no nome da tabela. A coluna é `text not null` e funciona como uma marca de proveniência validada pela camada de ingestão e pelo contrato do banco. As tabelas raw continuam usando a mesma coluna para o envelope da fonte recebida.

## Projeções públicas

| Tabela | Finalidade e origem da métrica | Chave da origem | Campos de data | Campos brutos e relação IXC | Retenção e acesso |
| --- | --- | --- | --- | --- | --- |
| `public.opa_attendances` | Atendimento agregado por registro do Opa! Suite. Alimenta `ATENDIMENTO`, sujeito ao mapa de paridade. | `source_id` do atendimento. | `data_abertura`, `data_inicio`, `data_ultima_interacao`, `data_finalizacao`, `source_updated_at`, `synced_at`. | `protocolo`, `contato_bruto`, `tipo_identificador`, `canal`, `status`, `motivo`, `avaliacao`, `fcr`; `ixc_customer_source_id` e `ixc_contract_source_id` opcionais. | Retenção analítica definida pela política de dados. RLS obrigatório; leitura somente pelo acesso autorizado do painel/API. |
| `public.opa_interactions` | Interações do atendimento, quando a fonte fornecer granularidade e identificador estáveis. | `source_id` da interação. | `data_interacao`, `source_updated_at`, `synced_at`. | Identificador bruto da interação e conteúdo mínimo necessário; relação opcional com atendimento e IXC. | Retenção analítica definida pela política de dados. RLS obrigatório; sem exposição de payload completo. |
| `public.ixc_customers` | Projeção de clientes IXC para vínculo analítico. Não é fonte de nomes para contatos Opa! sem chave confirmada. | `source_id` do cliente. | `source_updated_at`, `synced_at`. | Identificadores exigidos pelo contrato da fonte; PII somente se necessária e autorizada, fora de fixtures e documentação. | Retenção e acesso conforme política de dados. RLS obrigatório; leitura server-side autorizada. |
| `public.ixc_contracts` | Projeção de contratos IXC para `GERAL` e vínculos opcionais. | `source_id` do contrato. | `data_ativacao`, `source_updated_at`, `synced_at`. | `customer_source_id`, status e campos contratuais mínimos; relação com cliente opcional. | Retenção analítica definida pela política de dados. RLS obrigatório; leitura server-side autorizada. |
| `public.ixc_sales` | Projeção de vendas IXC para `GERAL`, após confirmação da fonte e da data de referência. | `source_id` da venda. | `data_venda`, `source_updated_at`, `synced_at`. | Campos de identificação da venda necessários ao cálculo; relações opcionais com cliente e contrato. | Retenção analítica definida pela política de dados. RLS obrigatório; sem valor estimado quando a fonte não estiver confirmada. |
| `public.ixc_cancellations` | Projeção de eventos de cancelamento para `CANCELAMENTOS`. | `source_id` do evento. | `data_cancelamento`, `source_updated_at`, `synced_at`. | `motivo`, tipo do evento e `contract_source_id` opcional. | Retenção analítica definida pela política de dados. RLS obrigatório; leitura server-side autorizada. |
| `public.analytics_sync_status` | Estado consultável da última sincronização por fonte e janela. | `source_system` + janela, com a unicidade definida pela migration. | `period_start`, `period_end`, `last_source_updated_at`, `synced_at`. | Contagens e `error_message` sanitizada; nenhum payload. | Retenção curta de estado e histórico em `integration.sync_runs`. RLS obrigatório; leitura somente pelo acesso autorizado. |

### Mapeamento de ingestão para as projeções atuais

Os mappers server-side não enviam o objeto recebido inteiro. Eles constroem rows explícitas, limitadas às colunas declaradas no manifesto, e sempre acrescentam `source_system`, `source_id`, `sync_run_id` e `synced_at`.

- Opa: `data_referencia` é interpretada como a data de abertura e vai para `data_abertura`. O campo original `data_referencia` não existe na projeção e não é enviado.
- IXC: `data_referencia` é interpretada como a data do cancelamento e vai para `data_cancelamento`. O campo original `data_referencia` não existe na projeção e não é enviado.
- Datas são normalizadas por `normalizeSourceTimestamp`. Datas date-only, calendários impossíveis e formatos fora do contrato viram `NULL`; nenhum valor inválido é enviado a uma coluna `timestamptz`.
- O conflito do upsert é sempre `source_id`, preservado como texto, incluindo zeros à esquerda.

## Convenção de relações

Uma relação com registro de origem usa sempre uma coluna `text nullable` com sufixo `_source_id`. O valor aponta para o `source_id` textual da tabela de destino, nunca para seu `id uuid` interno. A coluna recebe índice próprio e não recebe `NOT NULL`, porque a ingestão pode ocorrer antes do registro relacionado ou sem chave confirmada.

| Origem e coluna | Tipo | Destino lógico | Coluna de destino | Nulável | Índice | FK na migration inicial |
| --- | --- | --- | --- | --- | --- | --- |
| `public.opa_attendances.ixc_customer_source_id` | `text` | `public.ixc_customers` | `source_id` | sim | sim | adiada |
| `public.opa_attendances.ixc_contract_source_id` | `text` | `public.ixc_contracts` | `source_id` | sim | sim | adiada |
| `public.opa_interactions.attendance_source_id` | `text` | `public.opa_attendances` | `source_id` | sim | sim | adiada |
| `public.opa_interactions.ixc_customer_source_id` | `text` | `public.ixc_customers` | `source_id` | sim | sim | adiada |
| `public.opa_interactions.ixc_contract_source_id` | `text` | `public.ixc_contracts` | `source_id` | sim | sim | adiada |
| `public.ixc_contracts.customer_source_id` | `text` | `public.ixc_customers` | `source_id` | sim | sim | adiada |
| `public.ixc_sales.customer_source_id` | `text` | `public.ixc_customers` | `source_id` | sim | sim | adiada |
| `public.ixc_sales.contract_source_id` | `text` | `public.ixc_contracts` | `source_id` | sim | sim | adiada |
| `public.ixc_cancellations.contract_source_id` | `text` | `public.ixc_contracts` | `source_id` | sim | sim | adiada |

O encadeamento analítico é `opa_attendances.source_id` para `opa_interactions.attendance_source_id`, seguido pelos vínculos opcionais da interação com `ixc_customer_source_id` e `ixc_contract_source_id`. Os campos diretos de IXC no atendimento também ficam nulos até que a origem comprove a relação. Nenhuma chave é derivada de telefone, protocolo, nome ou proximidade temporal.

`sync_run_id` é uma relação diferente: é `uuid nullable`, indexada, e aponta logicamente para `integration.sync_runs.id`. O manifesto registra essa relação, mas a convenção `_source_id` não se aplica porque o destino é o identificador interno da execução.

As FKs ficam adiadas na migration inicial para permitir ingestão por lotes, reprocessamento idempotente e ordem variável entre raw, atendimento, interação, cliente e contrato. Uma FK imediata faria uma linha válida da origem falhar quando o registro relacionado ainda não tivesse sido projetado. A adição posterior de FKs depende de cardinalidade, retenção e ordem de carga confirmadas.

## Domínio de sincronização

`analytics_sync_status.status` e o estado correspondente em `integration.sync_runs` aceitam somente:

```text
success | partial | failed | unavailable
```

`unavailable` significa que a fonte ou a persistência não forneceu dados válidos para a janela. Não deve ser convertido em zero, lista vazia definitiva ou sucesso. `partial` exige que as contagens e a causa sanitizada sejam preservadas.

## Política de contagens do repositório

O PostgREST confirma o resultado do upsert em lote, mas a resposta padrão não distingue quais linhas foram inseridas e quais foram atualizadas. O executor padrão registra a quantidade de linhas aceitas como `persisted`, mantém `inserted` e `updated` desconhecidos, e devolve `partial` com uma mensagem sanitizada para o consumidor. Ele não transforma a quantidade total em inserções ou atualizações inventadas. Um executor injetado pode fornecer `inserted`, `updated` e `failed` quando possuir metadado confiável; o resultado detalhado só marca `success` quando essas contagens estão disponíveis e não há falha.

Quando a configuração administrativa está ausente, ou quando o erro indica tabela, coluna ou schema indisponível, o resultado é `unavailable` com `failed` igual ao número de rows deduplicadas. Outros erros de persistência resultam em `failed`. Em ambos os casos, a mensagem exposta é sanitizada e não contém detalhes do provedor, payload, token, telefone, protocolo ou credencial.

## Índices e constraints esperados

A migration deverá criar unicidade em todos os `source_id`, índices para os campos usados em filtros de período e índices para `sync_run_id` e chaves opcionais quando houver junção. Foreign keys para registros de origem podem ser adicionadas apenas quando a cardinalidade e a retenção não quebrarem reprocessamento; a ausência de uma chave confirmada deve permanecer `NULL`.

O manifesto fixture-only lista exatamente as seis entidades públicas com `source_id` único: `opa_attendances`, `opa_interactions`, `ixc_customers`, `ixc_contracts`, `ixc_sales` e `ixc_cancellations`. As duas tabelas raw também têm seu próprio `source_id text not null unique`, com índice. Essa unicidade é local a cada tabela raw e não substitui a unicidade das seis projeções públicas. `sync_runs` usa `request_id text not null unique`; `analytics_sync_status`, que não tem `source_id`, usa uma unicidade composta por `source_system`, `period_start` e `period_end`. O teste fixture-only verifica essas invariantes separadamente.

## RLS e isolamento

As sete tabelas `public.*` e as três tabelas `integration.*` têm `rlsRequired=true` no manifesto. A escolha de RLS em `integration` é defesa em profundidade, mesmo com o schema fora da exposição do Data API. O manifesto marca `integration.*` como `dataApiExposed=false`. As tabelas `public.*` são projeções do schema público, mas não têm política de leitura permissiva nem acesso direto autorizado para `anon` ou `authenticated`; o consumo previsto é pela API protegida server-side.

Na migration aplicada, `policies` permanece vazio e `defaultPolicies` é `deny`. O SQL usa grants somente nas tabelas novas. O bloco abaixo representa o princípio de isolamento, não deve ser executado como um revoke amplo sobre todas as tabelas existentes do aplicativo:

```sql
REVOKE ALL ON SCHEMA integration FROM anon, authenticated;
REVOKE ALL ON TABLE
  integration.opa_records_raw,
  integration.ixc_records_raw,
  integration.sync_runs,
  public.opa_attendances,
  public.opa_interactions,
  public.ixc_customers,
  public.ixc_contracts,
  public.ixc_sales,
  public.ixc_cancellations,
  public.analytics_sync_status
FROM anon, authenticated;
```

O cliente server-side autorizado deverá receber somente o acesso necessário quando o modelo de autorização estiver definido. Nenhuma policy baseada apenas em `TO authenticated` é presumida neste contrato.

Asserções mínimas para executar após a migration local (com pgTAP disponível):

```sql
select has_table('public', 'opa_attendances');
select has_table('public', 'ixc_contracts');
select has_table('public', 'ixc_cancellations');
select has_column('public', 'opa_attendances', 'contato_bruto');
select has_column('public', 'opa_attendances', 'source_id');
select has_table('public', 'analytics_sync_status');
select has_schema('integration');
```

O teste final também deverá consultar `pg_class.relrowsecurity`, verificar as constraints únicas de `source_id` e tentar estados inválidos em uma transação de teste. Essas verificações não foram executadas neste worktree porque não há banco local.

## Limites de segurança

Não entram neste contrato: tokens, headers de autenticação, chaves Supabase, `service_role`, nomes, telefones, protocolos ou IDs reais. A relação Opa! Suite ↔ IXC só pode ser preenchida quando a chave e seu significado forem confirmados por evidência sanitizada. A criação do schema não autoriza agenda n8n, carga remota ou alteração de workflows Opa!. O upsert só pode ocorrer pelo processo server-side autorizado, com segredo injetado no runtime e validação do allow-list do Data API.
