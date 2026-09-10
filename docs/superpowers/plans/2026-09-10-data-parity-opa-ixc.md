# Paridade de dados Opa! Suite e IXC no Indique e Ganhe: plano de implementação

> **Para agentes de implementação:** use `superpowers:subagent-driven-development` ou `superpowers:executing-plans` para executar este plano tarefa por tarefa. As etapas usam checkboxes para acompanhamento.

**Objetivo:** Construir uma camada analítica que reproduza os dados das páginas `GERAL`, `ATENDIMENTO` e `CANCELAMENTOS` do Data Studio no painel do Indique e Ganhe, usando Opa! Suite, IXC e as tabelas atuais da aplicação.

**Arquitetura:** O n8n fará a ingestão server-side, em workflows separados da operação de atendimento, preservando os registros brutos e persistindo entidades normalizadas no Supabase. O Next.js consultará uma API protegida que calcula ou lê indicadores analíticos com proveniência, período, cobertura e estado de sincronização.

**Tecnologias:** Next.js App Router 15, React 19, TypeScript 5.9, Supabase/Postgres, `@supabase/ssr`, `@supabase/supabase-js`, n8n, Opa! Suite API, IXC API, Node test runner via `tsx`, Recharts já existente.

**Especificação:** `docs/superpowers/specs/2026-09-10-data-parity-opa-ixc-design.md`

## Restrições globais

- O escopo de dados contém somente `GERAL`, `ATENDIMENTO` e `CANCELAMENTOS`; `HUNTER` e `FARMER` não serão implementados.
- A igualdade exigida é de dados, filtros, agrupamentos e regras de cálculo; a reprodução do layout visual não é requisito deste ciclo.
- O Data Studio é referência de reconciliação, não fonte operacional do painel e não deve ser copiado como snapshot fixo.
- O número bruto recebido da origem deve ser preservado sem conversão automática em nome de cliente.
- Relações Opa! Suite ↔ IXC são opcionais e só podem usar chaves cujo significado esteja confirmado.
- Workflows transacionais existentes do Opa! Suite não serão alterados para carregar analytics.
- Tokens e credenciais ficam em n8n ou servidor; não entram em frontend, fixtures, logs ou respostas públicas.
- Nenhuma carga real, agenda de produção ou publicação será executada durante testes locais.
- Toda tabela exposta no Supabase terá RLS e grants compatíveis com o modelo de acesso efetivamente implementado.
- Toda mudança de comportamento será feita em TDD: teste falhando, implementação mínima, teste verde e refatoração somente após o verde.
- A validação final deve executar novamente testes, lint e build depois da última alteração.

## Gates externos que antecedem ingestão

Antes de ativar qualquer sincronização real, devem existir evidências somente de leitura para:

1. Endpoint de listagem do Opa! Suite, filtros de período, paginação, limite e campo de atualização.
2. Endpoints IXC para clientes, contratos, vendas e cancelamentos que alimentam cada métrica.
3. Payloads sanitizados suficientes para testar normalização sem telefone, nome, protocolo ou ID real.
4. Definição de cada métrica do Data Studio, incluindo campo de data, status, deduplicação e agrupamento.
5. Autorização de leitura e janela de teste que não altere dados nas fontes.

Se a rota de listagem ou alguma regra não puder ser comprovada, a tarefa correspondente termina com o bloqueio documentado e não cria uma carga que estime os dados.

---

### Tarefa 1: Mapear os componentes do Data Studio e congelar fixtures sanitizados

**Arquivos:**

- Criar: `docs/analytics/data-studio-parity-map.md`
- Criar: `tests/fixtures/analytics/source-fixtures.ts`
- Criar: `tests/regression/analytics-fixture-contract.test.ts`

**Interfaces produzidas:**

- O documento define uma linha por componente com `page`, `componentId`, `label`, `source`, `dateField`, `filter`, `groupBy`, `distinctBy`, `rawField` e `expectedValidation`.
- O fixture exporta `opaAttendanceFixture`, `ixcCustomerFixture`, `ixcContractFixture`, `ixcCancellationFixture` e `generalMetricFixture` sem dados reais.
- O teste garante que cada fixture declare origem, identificador externo, data de referência e estado de vínculo quando aplicável.

- [ ] **Passo 1: Escrever o teste RED para o contrato dos fixtures**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generalMetricFixture,
  ixcCancellationFixture,
  ixcContractFixture,
  ixcCustomerFixture,
  opaAttendanceFixture,
} from '../fixtures/analytics/source-fixtures';

test('fixtures analíticos declaram origem e identificador externo', () => {
  for (const fixture of [
    opaAttendanceFixture,
    ixcCustomerFixture,
    ixcContractFixture,
    ixcCancellationFixture,
    generalMetricFixture,
  ]) {
    assert.equal(typeof fixture.source_system, 'string');
    assert.equal(typeof fixture.source_id, 'string');
    assert.ok(fixture.source_id.length > 0);
  }
});
```

- [ ] **Passo 2: Rodar o teste para confirmar a falha**

Executar:

```text
npx tsx --test tests/regression/analytics-fixture-contract.test.ts
```

Resultado esperado: falha por `tests/fixtures/analytics/source-fixtures.ts` inexistente.

- [ ] **Passo 3: Criar fixtures sanitizados mínimos**

Usar somente valores fictícios e explícitos:

```ts
export const opaAttendanceFixture = {
  source_system: 'opa',
  source_id: 'opa-test-attendance-001',
  protocolo: 'PROTOCOLO_TESTE_001',
  contato_bruto: 'ID_BRUTO_TESTE_001',
  tipo_identificador: 'unknown',
  canal: 'teste',
  status: 'finalizado',
  data_abertura: '2026-09-01T10:00:00-03:00',
  data_finalizacao: '2026-09-01T10:15:00-03:00',
  status_vinculo: 'nao_vinculado',
};

export const ixcCustomerFixture = {
  source_system: 'ixc',
  source_id: 'ixc-test-customer-001',
  nome: 'Cliente de Fixture',
  telefone: '00000000000',
};

export const ixcContractFixture = {
  source_system: 'ixc',
  source_id: 'ixc-test-contract-001',
  customer_source_id: 'ixc-test-customer-001',
  status: 'A',
  data_ativacao: '2026-09-01',
};

export const ixcCancellationFixture = {
  source_system: 'ixc',
  source_id: 'ixc-test-cancellation-001',
  contract_source_id: 'ixc-test-contract-001',
  motivo: 'motivo-teste',
  data_cancelamento: '2026-09-02',
};

export const generalMetricFixture = {
  source_system: 'indique',
  source_id: 'metric-test-general-001',
  metric_id: 'total_leads',
  value: 2,
  reference_date: '2026-09-01',
};
```

- [ ] **Passo 4: Rodar o teste para confirmar o verde**

Executar o mesmo comando e confirmar uma aprovação.

- [ ] **Passo 5: Registrar o mapa de paridade**

Preencher `docs/analytics/data-studio-parity-map.md` com os componentes observados das três páginas. Uma linha só pode ser marcada como validável quando indicar a fonte e a regra. Componentes sem endpoint ou sem semântica confirmada devem ficar em uma seção `Gates de fonte`, não receber valor estimado.

- [ ] **Passo 6: Rodar `npm test` e commit**

```text
npm test
git add docs/analytics/data-studio-parity-map.md tests/fixtures/analytics/source-fixtures.ts tests/regression/analytics-fixture-contract.test.ts
git commit -m "docs: map data studio parity contract"
```

---

### Tarefa 2: Criar contratos de domínio e normalização dos identificadores

**Arquivos:**

- Criar: `lib/analytics/types.ts`
- Criar: `lib/analytics/normalizers.ts`
- Testar: `tests/regression/analytics-normalizers.test.ts`

**Interfaces produzidas:**

```ts
export type AnalyticsSource = 'opa' | 'ixc' | 'indique';
export type IdentifierKind = 'phone' | 'client_id' | 'contract_id' | 'protocol' | 'metric' | 'unknown';
export type LinkStatus = 'vinculado' | 'nao_vinculado' | 'ambiguo' | 'nao_aplicavel';

export interface RawIdentifier {
  rawValue: string | null;
  kind: IdentifierKind;
}

export interface OpaAttendanceRecord {
  source_id: string;
  protocolo: string | null;
  contato_bruto: string | null;
  tipo_identificador: IdentifierKind;
  canal: string | null;
  status: string | null;
  status_vinculo: LinkStatus;
  data_referencia: string | null;
  data_abertura?: string | null;
  data_finalizacao?: string | null;
  source_updated_at?: string | null;
}

export interface IxcCancellationRecord {
  source_id: string;
  motivo: string | null;
  tipo: 'cancelamento' | 'renovacao' | 'upgrade' | 'downgrade' | 'outro';
  data_referencia: string | null;
  source_updated_at?: string | null;
}

export interface DateStampedMetricRecord {
  source_id: string;
  data_referencia: string | null;
}

export interface GeneralMetricInput {
  leads: readonly DateStampedMetricRecord[];
  sales: readonly DateStampedMetricRecord[];
  contracts: readonly DateStampedMetricRecord[];
  preContracts: readonly DateStampedMetricRecord[];
}

export function preserveRawIdentifier(value: unknown): RawIdentifier;
export function classifyIdentifier(value: string | null, hint?: string | null): IdentifierKind;
export function normalizeSourceTimestamp(value: unknown): string | null;
```

- [ ] **Passo 1: Escrever testes RED para preservar valor bruto e datas**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyIdentifier, normalizeSourceTimestamp, preserveRawIdentifier } from '../../lib/analytics/normalizers';

test('preserveRawIdentifier mantém zeros à esquerda e não converte para number', () => {
  const identifier = preserveRawIdentifier('000123');
  assert.equal(identifier.rawValue, '000123');
  assert.equal(typeof identifier.rawValue, 'string');
  assert.equal(identifier.kind, 'unknown');
});

test('classifyIdentifier respeita dica explícita da origem', () => {
  assert.equal(classifyIdentifier('123', 'id_cliente'), 'client_id');
  assert.equal(classifyIdentifier('123', 'protocolo'), 'protocol');
});

test('normalizeSourceTimestamp retorna ISO ou null', () => {
  assert.equal(normalizeSourceTimestamp('2026-09-01T10:00:00-03:00'), '2026-09-01T13:00:00.000Z');
  assert.equal(normalizeSourceTimestamp('valor-invalido'), null);
  assert.equal(normalizeSourceTimestamp(null), null);
});
```

- [ ] **Passo 2: Rodar o teste e confirmar a falha esperada**

```text
npx tsx --test tests/regression/analytics-normalizers.test.ts
```

Resultado esperado: falha porque os módulos de analytics ainda não existem.

- [ ] **Passo 3: Implementar os tipos e normalizadores mínimos**

Regras obrigatórias:

```ts
export function preserveRawIdentifier(value: unknown): RawIdentifier {
  if (value === null || value === undefined) {
    return { rawValue: null, kind: 'unknown' };
  }

  const rawValue = String(value).trim();
  return {
    rawValue: rawValue || null,
    kind: 'unknown',
  };
}
```

`classifyIdentifier` só pode retornar uma categoria quando a dica do campo ou o contrato da fonte for explícito. Não inferir telefone, cliente ou protocolo apenas pelo tamanho do número. `normalizeSourceTimestamp` deve converter datas válidas para ISO UTC e retornar `null` em entrada inválida.

- [ ] **Passo 4: Rodar o teste para confirmar o verde**

Executar o teste específico e depois `npm test`.

- [ ] **Passo 5: Testar casos de vínculo**

Adicionar casos para `null`, string vazia, valor numérico, valor com espaços, identificador ambíguo e timestamp brasileiro já suportado pelo domínio atual. Os testes devem provar que o valor bruto não sofre arredondamento, `Number()` ou remoção de zeros.

- [ ] **Passo 6: Commit**

```text
git add lib/analytics/types.ts lib/analytics/normalizers.ts tests/regression/analytics-normalizers.test.ts
git commit -m "feat: add analytics source contracts"
```

---

### Tarefa 3: Implementar agregadores puros para os três conjuntos de indicadores

**Arquivos:**

- Criar: `lib/analytics/metrics.ts`
- Modificar: `lib/date-filters.ts` somente se o contrato de timezone exigir uma extensão testada
- Testar: `tests/regression/analytics-metrics.test.ts`

**Interfaces produzidas:**

```ts
export interface MetricWindow {
  from: string | null;
  to: string | null;
  timezone: 'America/Sao_Paulo';
}

export interface AttendanceSummary {
  total: number;
  linked: number;
  unlinked: number;
  byChannel: Array<{ key: string; count: number }>;
  byStatus: Array<{ key: string; count: number }>;
}

export interface CancellationSummary {
  total: number;
  byReason: Array<{ key: string; count: number }>;
  renewals: number;
  upgrades: number;
  downgrades: number;
}

export interface GeneralSummary {
  leads: number;
  sales: number;
  contracts: number;
  preContracts: number;
}

export function summarizeAttendance(records: readonly OpaAttendanceRecord[], window: MetricWindow): AttendanceSummary;
export function summarizeCancellations(records: readonly IxcCancellationRecord[], window: MetricWindow): CancellationSummary;
export function summarizeGeneral(input: GeneralMetricInput, window: MetricWindow): GeneralSummary;
```

- [ ] **Passo 1: Escrever testes RED com fixtures sanitizados**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAttendance, summarizeCancellations } from '../../lib/analytics/metrics';

const window = {
  from: '2026-09-01T00:00:00-03:00',
  to: '2026-09-30T23:59:59-03:00',
  timezone: 'America/Sao_Paulo' as const,
};

test('summarizeAttendance conta protocolos únicos e separa vínculo', () => {
  const result = summarizeAttendance([
    { source_id: 'a', protocolo: 'p-1', status_vinculo: 'vinculado', canal: 'whatsapp', status: 'finalizado', data_referencia: '2026-09-02T10:00:00Z' },
    { source_id: 'b', protocolo: 'p-1', status_vinculo: 'vinculado', canal: 'whatsapp', status: 'finalizado', data_referencia: '2026-09-02T10:01:00Z' },
    { source_id: 'c', protocolo: 'p-2', status_vinculo: 'nao_vinculado', canal: 'telefone', status: 'aberto', data_referencia: '2026-09-03T10:00:00Z' },
  ], window);

  assert.equal(result.total, 2);
  assert.equal(result.linked, 1);
  assert.equal(result.unlinked, 1);
});

test('summarizeCancellations ignora cancelamentos fora da janela', () => {
  const result = summarizeCancellations([
    { source_id: 'c-1', motivo: 'preco', tipo: 'cancelamento', data_referencia: '2026-09-05T10:00:00Z' },
    { source_id: 'c-2', motivo: 'mudanca', tipo: 'cancelamento', data_referencia: '2026-08-31T23:59:59Z' },
  ], window);

  assert.equal(result.total, 1);
  assert.deepEqual(result.byReason, [{ key: 'preco', count: 1 }]);
});
```

- [ ] **Passo 2: Rodar e observar a falha correta**

```text
npx tsx --test tests/regression/analytics-metrics.test.ts
```

Resultado esperado: falha por tipos e funções ainda inexistentes.

- [ ] **Passo 3: Implementar contagem, janela e agrupamento mínimos**

As funções devem:

1. Converter datas pelo helper existente ou helper testado equivalente.
2. Incluir início e fim da janela.
3. Deduplicar por protocolo ou `source_id` conforme o mapa de paridade.
4. Manter registros sem vínculo na contagem total.
5. Ordenar agrupamentos de forma determinística por contagem decrescente e chave ascendente.
6. Não criar regras de negócio que não estejam no mapa da Tarefa 1.

- [ ] **Passo 4: Rodar teste específico e suíte completa**

```text
npx tsx --test tests/regression/analytics-metrics.test.ts
npm test
```

- [ ] **Passo 5: Commit**

```text
git add lib/analytics/metrics.ts lib/date-filters.ts tests/regression/analytics-metrics.test.ts
git commit -m "feat: add analytics metric aggregators"
```

---

### Tarefa 4: Criar o esquema Supabase para origem, proveniência e estado de sincronização

**Arquivos:**

- Criar: migration gerada pelo comando `supabase migration new create_analytics_sources` em `supabase/migrations/`
- Criar: `supabase/tests/analytics-schema.sql` se o projeto Supabase local suportar a suíte SQL disponível
- Criar: `docs/analytics/database-contract.md`

**Interfaces produzidas:**

```text
integration.opa_records_raw
integration.ixc_records_raw
integration.sync_runs
public.opa_attendances
public.opa_interactions
public.ixc_customers
public.ixc_contracts
public.ixc_sales
public.ixc_cancellations
public.analytics_sync_status
```

- [ ] **Passo 1: Descobrir comandos e estado do Supabase local**

Executar primeiro:

```text
supabase --help
supabase db --help
supabase migration --help
```

Confirmar que a CLI e um banco local estão disponíveis. Se não estiverem, não executar SQL remoto; registrar o bloqueio no documento e testar a parte de contrato por fixtures.

- [ ] **Passo 2: Escrever o teste de schema ou asserções SQL RED**

O teste deve verificar, depois da migration, que as tabelas principais existem, que `source_id` é único, que RLS está habilitado e que o estado de sincronização aceita apenas `success`, `partial`, `failed` e `unavailable`.

Exemplo de asserções:

```sql
select has_table('public', 'opa_attendances');
select has_table('public', 'ixc_contracts');
select has_table('public', 'ixc_cancellations');
select has_column('public', 'opa_attendances', 'contato_bruto');
select has_column('public', 'opa_attendances', 'source_id');
```

- [ ] **Passo 3: Gerar a migration pelo comando oficial**

```text
supabase migration new create_analytics_sources
```

Editar somente o arquivo timestampado criado pelo comando. A migration deve:

```sql
create schema if not exists integration;

create table if not exists public.opa_attendances (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  protocolo text,
  contato_bruto text,
  tipo_identificador text not null default 'unknown',
  canal text,
  atendente text,
  departamento text,
  status text,
  motivo text,
  avaliacao text,
  fcr boolean,
  data_abertura timestamptz,
  data_inicio timestamptz,
  data_ultima_interacao timestamptz,
  data_finalizacao timestamptz,
  status_vinculo text not null default 'nao_aplicavel',
  ixc_customer_id text,
  ixc_contract_id text,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  sync_run_id uuid
);
```

Criar tabelas equivalentes para interações, clientes, contratos, vendas, cancelamentos e execução de sincronização, com `source_id` único, índices nas datas e chaves de relacionamento opcionais. O payload completo deve ficar na camada `integration` restrita, não em uma tabela pública de consulta.

- [ ] **Passo 4: Aplicar somente no banco local e verificar RLS**

Executar os comandos descobertos no Passo 1, por exemplo:

```text
supabase db reset
```

Verificar tabelas, índices, constraints e RLS. Não usar projeto remoto, `SUPABASE_SERVICE_ROLE_KEY` real ou produção.

- [ ] **Passo 5: Documentar o contrato do banco**

Em `docs/analytics/database-contract.md`, registrar para cada tabela: finalidade, chave da origem, campos de data, campos brutos, relação opcional com IXC, retenção, acesso e origem da métrica.

- [ ] **Passo 6: Rodar validação e commit**

```text
npm test
git diff --check
git add supabase docs/analytics/database-contract.md
git commit -m "feat: add analytics source schema"
```

---

### Tarefa 5: Implementar o contrato de ingestão e o repositório server-side

**Arquivos:**

- Criar: `lib/analytics/ingestion.ts`
- Criar: `lib/analytics/repository.ts`
- Criar: `tests/regression/analytics-ingestion.test.ts`
- Modificar: `lib/supabase-admin.ts` somente se for necessário separar explicitamente cliente server-side e cliente de navegador

**Interfaces produzidas:**

```ts
export interface SyncRunInput {
  source: 'opa' | 'ixc';
  periodStart: string;
  periodEnd: string;
  requestId: string;
}

export interface SyncRunResult {
  source: 'opa' | 'ixc';
  status: 'success' | 'partial' | 'failed' | 'unavailable';
  received: number;
  inserted: number;
  updated: number;
  failed: number;
  lastSourceUpdatedAt: string | null;
}

export function buildIdempotentUpsert<T extends { source_id: string }>(records: readonly T[]): T[];
export function sanitizeSyncError(error: unknown): string;
export async function upsertOpaAttendanceBatch(records: readonly OpaAttendanceRecord[], runId: string): Promise<number>;
export async function upsertIxcCancellationBatch(records: readonly IxcCancellationRecord[], runId: string): Promise<number>;
```

- [ ] **Passo 1: Escrever testes RED para deduplicação e sanitização**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIdempotentUpsert, sanitizeSyncError } from '../../lib/analytics/ingestion';

test('buildIdempotentUpsert mantém apenas o último registro por source_id', () => {
  const result = buildIdempotentUpsert([
    { source_id: 'same', source_updated_at: '2026-09-01T10:00:00Z' },
    { source_id: 'same', source_updated_at: '2026-09-01T11:00:00Z' },
    { source_id: 'other', source_updated_at: '2026-09-01T10:00:00Z' },
  ]);

  assert.equal(result.length, 2);
  assert.equal(result.find((item) => item.source_id === 'same')?.source_updated_at, '2026-09-01T11:00:00Z');
});

test('sanitizeSyncError não devolve token nem payload bruto', () => {
  const message = sanitizeSyncError(new Error('Bearer segredo-de-teste payload telefone 00000000000'));
  assert.equal(message.includes('segredo-de-teste'), false);
  assert.equal(message.includes('00000000000'), false);
});
```

- [ ] **Passo 2: Rodar o teste e confirmar a falha**

```text
npx tsx --test tests/regression/analytics-ingestion.test.ts
```

- [ ] **Passo 3: Implementar o contrato mínimo**

`buildIdempotentUpsert` deve deduplicar por `source_id` deterministically, escolhendo a maior `source_updated_at` válida. `sanitizeSyncError` deve devolver uma mensagem genérica sem valores que pareçam token, telefone, payload, protocolo ou credencial. O repositório deve usar `supabaseAdmin` somente em módulos server-side.

- [ ] **Passo 4: Implementar upsert com proveniência**

Cada upsert deve preencher `sync_run_id`, `synced_at`, `source_system` e `source_id`. Falha em um registro deve incrementar `failed` sem converter a execução inteira em sucesso silencioso.

- [ ] **Passo 5: Rodar teste específico e suíte completa**

```text
npx tsx --test tests/regression/analytics-ingestion.test.ts
npm test
```

- [ ] **Passo 6: Commit**

```text
git add lib/analytics/ingestion.ts lib/analytics/repository.ts lib/supabase-admin.ts tests/regression/analytics-ingestion.test.ts
git commit -m "feat: add analytics ingestion repository"
```

---

### Tarefa 6: Definir e documentar o workflow n8n analítico separado

**Arquivos:**

- Criar: `docs/integrations/opa-ixc-analytics-sync.md`
- Modificar: nenhum workflow transacional existente
- Configurar remotamente somente depois dos gates externos desta especificação: novo workflow n8n pausado, fora do fluxo raiz de atendimento

**Interfaces produzidas:**

```text
Workflow: ANALYTICS - Sincronização OPA e IXC
Entradas: janela de período e cursor incremental
Saída: lotes normalizados para as tabelas de origem do Supabase
Estado: analytics_sync_status
```

- [ ] **Passo 1: Escrever o contrato do workflow antes da configuração**

Documentar estes nós, sem inserir token em texto:

```text
Trigger manual controlado ou Schedule pausado
→ OPA - Lista atendimentos (somente leitura)
→ OPA - Pagina resultados
→ OPA - Normaliza atendimento
→ IXC - Lista clientes/contratos/cancelamentos (somente leitura)
→ IXC - Normaliza registros
→ Deduplica por source_id
→ Supabase - Upsert lote
→ Supabase - Registra sync run
→ Falha controlada e estado partial/failed
```

O documento deve registrar que a credencial existente `OPA Bearer` é referenciada pelo node, sem copiar o valor do token.

- [ ] **Passo 2: Validar endpoints somente por configuração**

No n8n, inspecionar os nodes existentes e a documentação autorizada. Confirmar rota de listagem Opa!, paginação e endpoints IXC antes de criar qualquer node novo. Se só houver a consulta unitária por protocolo, interromper a configuração e registrar a limitação.

- [ ] **Passo 3: Criar workflow novo pausado**

Usar nomes de nodes que indiquem leitura e analytics. Não editar `ATEND - Piloto`, workflow de ciclo de vida, subworkflows ou automações operacionais. Não executar o workflow nesta etapa.

- [ ] **Passo 4: Verificar payload com fixture sanitizado**

Exportar somente a estrutura sem valores sensíveis e conferir que o payload normalizado satisfaz `lib/analytics/types.ts`. Não salvar export com headers Bearer, telefones, nomes, protocolos reais ou IDs reais.

- [ ] **Passo 5: Commit da documentação**

```text
git add docs/integrations/opa-ixc-analytics-sync.md
git commit -m "docs: define analytics sync workflow"
```

O workflow remoto não será considerado concluído por existir na interface. A conclusão depende de leitura autorizada, persistência comprovada e reconciliação.

---

### Tarefa 7: Expor o resumo analítico por API protegida

**Arquivos:**

- Criar: `lib/analytics/query.ts`
- Criar: `lib/analytics/response.ts`
- Criar: `app/api/analytics/overview/route.ts`
- Criar: `tests/regression/analytics-api-contract.test.ts`
- Modificar: `lib/auth-server.ts` somente para remover autorização baseada em `user_metadata` se a checagem atual continuar alcançando a nova rota

**Interfaces produzidas:**

```ts
export interface AnalyticsOverviewResponse {
  success: true;
  data: {
    geral: GeneralSummary;
    atendimento: AttendanceSummary;
    cancelamentos: CancellationSummary;
  };
  meta: {
    from: string | null;
    to: string | null;
    lastUpdatedAt: string | null;
    status: 'success' | 'partial' | 'failed' | 'unavailable';
    coverage: number;
  };
}

export function parseAnalyticsWindow(searchParams: URLSearchParams): MetricWindow;
export function serializeAnalyticsOverview(input: AnalyticsOverviewResponse): AnalyticsOverviewResponse;
```

- [ ] **Passo 1: Escrever teste RED para parâmetros e estados**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalyticsWindow } from '../../lib/analytics/query';

test('parseAnalyticsWindow aplica janela padrão no timezone do negócio', () => {
  const window = parseAnalyticsWindow(new URLSearchParams());
  assert.equal(window.timezone, 'America/Sao_Paulo');
  assert.equal(window.from, null);
  assert.equal(window.to, null);
});

test('parseAnalyticsWindow rejeita data inválida', () => {
  assert.throws(
    () => parseAnalyticsWindow(new URLSearchParams({ from: 'data-invalida' })),
    /data/i,
  );
});
```

- [ ] **Passo 2: Rodar o teste e confirmar a falha**

```text
npx tsx --test tests/regression/analytics-api-contract.test.ts
```

- [ ] **Passo 3: Implementar parser e consulta server-side**

O route handler deve:

1. Validar autenticação com helper server-side.
2. Validar `from` e `to` com Zod ou parser equivalente já instalado.
3. Consultar Supabase somente no servidor.
4. Retornar `401` sem sessão, `400` para janela inválida e `503` quando nenhuma fonte tiver dados válidos.
5. Nunca retornar segredo, payload bruto ou mensagem de erro do provedor.
6. Propagar `status`, `lastUpdatedAt` e `coverage`.
7. Usar `Cache-Control: no-store` enquanto o contrato de atualização não estiver validado.

- [ ] **Passo 4: Reforçar autorização da nova rota**

Testar que `user_metadata.role` não concede acesso administrativo. A role deverá vir da tabela autoritativa já prevista no projeto ou de uma função server-side equivalente. Se a correção tocar outros endpoints, manter a mudança isolada e cobrir os comportamentos antigos com testes.

- [ ] **Passo 5: Rodar testes e validar build**

```text
npx tsx --test tests/regression/analytics-api-contract.test.ts
npm test
npm run lint
npm run build
```

- [ ] **Passo 6: Commit**

```text
git add lib/analytics/query.ts lib/analytics/response.ts app/api/analytics/overview/route.ts lib/auth-server.ts tests/regression/analytics-api-contract.test.ts
git commit -m "feat: expose protected analytics overview"
```

---

### Tarefa 8: Adicionar o módulo de três páginas ao painel sem remover os módulos existentes

**Arquivos:**

- Criar: `components/views/analytics/analytics-view.tsx`
- Criar: `components/views/analytics/geral-view.tsx`
- Criar: `components/views/analytics/atendimento-view.tsx`
- Criar: `components/views/analytics/cancelamentos-view.tsx`
- Criar: `lib/analytics/navigation.ts`
- Criar: `tests/regression/analytics-navigation.test.ts`
- Modificar: `components/dashboard-shell.tsx`
- Modificar: `components/sidebar.tsx`

**Interfaces produzidas:**

```ts
export type AnalyticsTabId = 'geral' | 'atendimento' | 'cancelamentos';
export function isAnalyticsTabId(value: string | null): value is AnalyticsTabId;
export function getAnalyticsTabLabel(tab: AnalyticsTabId): string;
```

- [ ] **Passo 1: Escrever teste RED de navegação**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAnalyticsTabLabel, isAnalyticsTabId } from '../../lib/analytics/navigation';

test('aceita somente as três páginas do escopo', () => {
  assert.equal(isAnalyticsTabId('geral'), true);
  assert.equal(isAnalyticsTabId('atendimento'), true);
  assert.equal(isAnalyticsTabId('cancelamentos'), true);
  assert.equal(isAnalyticsTabId('hunter'), false);
  assert.equal(isAnalyticsTabId('farmer'), false);
});

test('rotula as três páginas em português', () => {
  assert.equal(getAnalyticsTabLabel('geral'), 'GERAL');
  assert.equal(getAnalyticsTabLabel('atendimento'), 'ATENDIMENTO');
  assert.equal(getAnalyticsTabLabel('cancelamentos'), 'CANCELAMENTOS');
});
```

- [ ] **Passo 2: Rodar o teste para confirmar a falha**

```text
npx tsx --test tests/regression/analytics-navigation.test.ts
```

- [ ] **Passo 3: Implementar navegação e views mínimas**

Adicionar uma entrada `Indicadores` ao shell atual e dentro dela expor exatamente os três tabs. Preservar `Leads`, `Vendas`, `Colaboradores`, `Comissões` e `Integrações` existentes. Não adicionar links para `HUNTER` ou `FARMER`.

Cada view deve:

1. Usar o mesmo período da URL ou um estado compartilhado do módulo.
2. Buscar `/api/analytics/overview` com `from` e `to`.
3. Renderizar dados de `data` sem valores hardcoded.
4. Mostrar `lastUpdatedAt`, `coverage` e estado parcial.
5. Tratar carregamento, erro e ausência de dados sem exibir zero artificial.
6. Manter o número bruto como texto quando o componente o apresentar.

- [ ] **Passo 4: Rodar teste específico e verificar compilação**

```text
npx tsx --test tests/regression/analytics-navigation.test.ts
npm test
npm run lint
```

- [ ] **Passo 5: Fazer verificação manual local sem fonte real**

Executar o app com variáveis Supabase ausentes ou fixtures locais e confirmar que o estado indisponível aparece, sem tentar chamar Opa! Suite, IXC ou Data Studio diretamente do navegador.

- [ ] **Passo 6: Commit**

```text
git add components/views/analytics lib/analytics/navigation.ts tests/regression/analytics-navigation.test.ts components/dashboard-shell.tsx components/sidebar.tsx
git commit -m "feat: add analytics dashboard sections"
```

---

### Tarefa 9: Implementar reconciliação formal com o Data Studio

**Arquivos:**

- Criar: `lib/analytics/reconciliation.ts`
- Criar: `tests/regression/analytics-reconciliation.test.ts`
- Modificar: `docs/analytics/data-studio-parity-map.md`
- Criar: `docs/analytics/reconciliation-runbook.md`

**Interfaces produzidas:**

```ts
export interface ReconciliationResult {
  metricId: string;
  expected: number | string;
  actual: number | string;
  difference: number | string;
  status: 'match' | 'mismatch' | 'not_comparable';
  reason: string | null;
}

export function compareMetric(
  metricId: string,
  expected: number | string,
  actual: number | string,
  reason?: string | null,
): ReconciliationResult;
```

- [ ] **Passo 1: Escrever testes RED para igualdade e divergência explicada**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareMetric } from '../../lib/analytics/reconciliation';

test('compareMetric marca match quando os valores são iguais', () => {
  assert.deepEqual(compareMetric('atendimento.total', 5040, 5040), {
    metricId: 'atendimento.total',
    expected: 5040,
    actual: 5040,
    difference: 0,
    status: 'match',
    reason: null,
  });
});

test('compareMetric exige explicação para mismatch aceito', () => {
  const result = compareMetric('atendimento.total', 5040, 5039, 'snapshot atualizado em horários diferentes');
  assert.equal(result.status, 'mismatch');
  assert.equal(result.reason, 'snapshot atualizado em horários diferentes');
});
```

- [ ] **Passo 2: Rodar e observar a falha esperada**

```text
npx tsx --test tests/regression/analytics-reconciliation.test.ts
```

- [ ] **Passo 3: Implementar comparação sem tolerância implícita**

Valores diferentes devem ser `mismatch`, mesmo que a diferença seja pequena. O motivo documenta apenas atualização, filtro ou limitação de fonte comprovada; não serve para esconder erro de cálculo.

- [ ] **Passo 4: Criar runbook de reconciliação**

Registrar:

```text
1. horário do Data Studio
2. filtros ativos
3. período e timezone
4. horário da última sincronização de cada fonte
5. valor esperado
6. valor obtido
7. diferença
8. causa confirmada
9. ação corretiva
```

- [ ] **Passo 5: Rodar testes e commit**

```text
npx tsx --test tests/regression/analytics-reconciliation.test.ts
npm test
git add lib/analytics/reconciliation.ts tests/regression/analytics-reconciliation.test.ts docs/analytics/data-studio-parity-map.md docs/analytics/reconciliation-runbook.md
git commit -m "feat: add analytics reconciliation checks"
```

---

### Tarefa 10: Executar o primeiro piloto controlado de leitura

**Arquivos:**

- Modificar: `docs/integrations/opa-ixc-analytics-sync.md` com resultados sanitizados
- Modificar: `docs/analytics/reconciliation-runbook.md` com a primeira execução
- Nenhum workflow transacional

**Gate de autorização:** esta tarefa exige autorização explícita para uma leitura real controlada. A aprovação do plano não autoriza execução de carga em produção.

- [ ] **Passo 1: Confirmar janela pequena e filtros**

Escolher uma janela curta e registrar período, timezone, endpoints, paginação, quantidade esperada e objetivo. Não executar `all time`.

- [ ] **Passo 2: Executar somente o workflow analítico pausado/manual**

Usar a credencial existente por referência no n8n. Confirmar que a operação é somente leitura nas fontes e upsert idempotente no destino autorizado.

- [ ] **Passo 3: Verificar `analytics_sync_status` e contagens**

Comparar registros recebidos, inseridos, atualizados, falhos, última data da fonte e cobertura. Não considerar `success` suficiente se a etapa de persistência falhar.

- [ ] **Passo 4: Comparar com o Data Studio**

Executar a matriz de reconciliação para `ATENDIMENTO`, depois `CANCELAMENTOS`. `GERAL` só será comparado depois que as fontes individuais estiverem estáveis.

- [ ] **Passo 5: Interromper em caso de divergência sem causa**

Registrar `mismatch` e não publicar o indicador como definitivo. Corrigir contrato, filtro ou fonte em uma nova tarefa TDD.

- [ ] **Passo 6: Commit somente da evidência sanitizada**

```text
git add docs/integrations/opa-ixc-analytics-sync.md docs/analytics/reconciliation-runbook.md
git commit -m "docs: record controlled analytics pilot"
```

---

### Tarefa 11: Gate final de qualidade e entrega local

**Arquivos:**

- Modificar: `docs/analytics/reconciliation-runbook.md`
- Modificar: `docs/integrations/opa-ixc-analytics-sync.md`
- Nenhum arquivo de segredo ou `.env` versionado

- [ ] **Passo 1: Rodar a suíte completa após a última alteração**

```text
npm test
```

Esperado: todas as suítes existentes e novas passam, sem falhas.

- [ ] **Passo 2: Rodar lint e build**

```text
npm run lint
npm run build
```

Registrar warnings existentes separadamente de erros introduzidos pelo módulo.

- [ ] **Passo 3: Verificar diff, estado e segredos**

```text
git diff --check
git status --short
git diff -- . ':!package-lock.json'
rg -n "OPA_BEARER|OPA Bearer|Authorization: Bearer|IXC_TOKEN|SUPABASE_SERVICE_ROLE_KEY|telefone|protocolo" docs lib app components tests
```

O último comando deve ser revisado manualmente para distinguir nomes de campos e documentação sanitizada de valores reais. Nenhum segredo ou payload real pode aparecer.

- [ ] **Passo 4: Verificar estados de indisponibilidade**

Abrir o painel sem sincronização válida e confirmar que cada página mostra estado `unavailable` ou `partial`, sem inventar zeros.

- [ ] **Passo 5: Registrar o limite de publicação**

Documentar que o branch local não foi publicado, nenhuma agenda n8n foi ativada e nenhuma carga de produção foi executada sem gate separado.

- [ ] **Passo 6: Commit final da documentação**

```text
git add docs/analytics docs/integrations
git commit -m "docs: record analytics delivery verification"
```

## Handoff de execução

Plano completo e salvo em `docs/superpowers/plans/2026-09-10-data-parity-opa-ixc.md`.

Há duas formas de executar:

1. **Subagent-Driven:** criar um agente novo por tarefa, revisar entre as tarefas e manter checkpoints independentes.
2. **Inline:** executar as tarefas nesta mesma sessão, usando checkpoints após cada módulo.

A execução deve começar pela Tarefa 1. Nenhum código de produção deve ser escrito antes do teste RED correspondente, e a Tarefa 10 exige autorização separada para leitura real controlada.
