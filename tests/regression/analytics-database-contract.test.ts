import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyticsDatabaseManifest,
  analyticsSecuritySqlTarget,
} from '../fixtures/analytics/database-contract';

const expectedIntegrationTables = [
  'opa_records_raw',
  'ixc_records_raw',
  'sync_runs',
];

const expectedPublicTables = [
  'opa_attendances',
  'opa_interactions',
  'ixc_customers',
  'ixc_contracts',
  'ixc_sales',
  'ixc_cancellations',
  'analytics_sync_status',
];

const expectedUniqueSourceIdTables = [
  'public.opa_attendances',
  'public.opa_interactions',
  'public.ixc_customers',
  'public.ixc_contracts',
  'public.ixc_sales',
  'public.ixc_cancellations',
];

const expectedSourceRelations = [
  'public.opa_attendances.ixc_customer_source_id->public.ixc_customers.source_id',
  'public.opa_attendances.ixc_contract_source_id->public.ixc_contracts.source_id',
  'public.opa_interactions.attendance_source_id->public.opa_attendances.source_id',
  'public.opa_interactions.ixc_customer_source_id->public.ixc_customers.source_id',
  'public.opa_interactions.ixc_contract_source_id->public.ixc_contracts.source_id',
  'public.ixc_contracts.customer_source_id->public.ixc_customers.source_id',
  'public.ixc_sales.customer_source_id->public.ixc_customers.source_id',
  'public.ixc_sales.contract_source_id->public.ixc_contracts.source_id',
  'public.ixc_cancellations.contract_source_id->public.ixc_contracts.source_id',
];

const expectedRequiredColumns: Record<string, string[]> = {
  'integration.opa_records_raw': [
    'id',
    'source_id',
    'source_system',
    'record_type',
    'payload',
    'received_at',
    'sync_run_id',
  ],
  'integration.ixc_records_raw': [
    'id',
    'source_id',
    'source_system',
    'record_type',
    'payload',
    'received_at',
    'sync_run_id',
  ],
  'integration.sync_runs': [
    'id',
    'source_system',
    'request_id',
    'period_start',
    'period_end',
    'status',
    'received',
    'inserted',
    'updated',
    'failed',
    'started_at',
    'finished_at',
  ],
  'public.opa_attendances': [
    'id',
    'source_system',
    'source_id',
    'protocolo',
    'contato_bruto',
    'tipo_identificador',
    'canal',
    'status_vinculo',
    'data_abertura',
    'data_finalizacao',
    'source_updated_at',
    'synced_at',
    'sync_run_id',
  ],
  'public.opa_interactions': [
    'id',
    'source_system',
    'source_id',
    'attendance_source_id',
    'ixc_customer_source_id',
    'ixc_contract_source_id',
    'data_interacao',
    'source_updated_at',
    'synced_at',
    'sync_run_id',
  ],
  'public.ixc_customers': [
    'id',
    'source_system',
    'source_id',
    'source_updated_at',
    'synced_at',
    'sync_run_id',
  ],
  'public.ixc_contracts': [
    'id',
    'source_system',
    'source_id',
    'customer_source_id',
    'status',
    'data_ativacao',
    'source_updated_at',
    'synced_at',
    'sync_run_id',
  ],
  'public.ixc_sales': [
    'id',
    'source_system',
    'source_id',
    'customer_source_id',
    'contract_source_id',
    'status',
    'data_venda',
    'source_updated_at',
    'synced_at',
    'sync_run_id',
  ],
  'public.ixc_cancellations': [
    'id',
    'source_system',
    'source_id',
    'contract_source_id',
    'motivo',
    'tipo',
    'data_cancelamento',
    'source_updated_at',
    'synced_at',
    'sync_run_id',
  ],
  'public.analytics_sync_status': [
    'id',
    'source_system',
    'period_start',
    'period_end',
    'status',
    'received',
    'inserted',
    'updated',
    'failed',
    'last_source_updated_at',
    'synced_at',
    'sync_run_id',
  ],
};

type ExpectedColumn = {
  name: string;
  type: string;
  nullable: boolean;
  unique: boolean;
  indexed: boolean;
  payload: boolean;
  allowedValues?: readonly string[];
};

function expectedColumn(
  name: string,
  type: string,
  nullable: boolean,
  options: Partial<Pick<ExpectedColumn, 'unique' | 'indexed' | 'payload' | 'allowedValues'>> = {},
): ExpectedColumn {
  return {
    name,
    type,
    nullable,
    unique: false,
    indexed: false,
    payload: false,
    ...options,
  };
}

const expectedColumnsByTable: Record<string, ExpectedColumn[]> = {
  'integration.opa_records_raw': [
    expectedColumn('id', 'uuid', false),
    expectedColumn('source_id', 'text', false, { unique: true, indexed: true }),
    expectedColumn('source_system', 'text', false),
    expectedColumn('record_type', 'text', false),
    expectedColumn('payload', 'jsonb', false, { payload: true }),
    expectedColumn('source_updated_at', 'timestamptz', true, { indexed: true }),
    expectedColumn('received_at', 'timestamptz', false, { indexed: true }),
    expectedColumn('sync_run_id', 'uuid', true, { indexed: true }),
  ],
  'integration.ixc_records_raw': [
    expectedColumn('id', 'uuid', false),
    expectedColumn('source_id', 'text', false, { unique: true, indexed: true }),
    expectedColumn('source_system', 'text', false),
    expectedColumn('record_type', 'text', false),
    expectedColumn('payload', 'jsonb', false, { payload: true }),
    expectedColumn('source_updated_at', 'timestamptz', true, { indexed: true }),
    expectedColumn('received_at', 'timestamptz', false, { indexed: true }),
    expectedColumn('sync_run_id', 'uuid', true, { indexed: true }),
  ],
  'integration.sync_runs': [
    expectedColumn('id', 'uuid', false),
    expectedColumn('source_system', 'text', false),
    expectedColumn('request_id', 'text', false, { unique: true, indexed: true }),
    expectedColumn('period_start', 'timestamptz', false, { indexed: true }),
    expectedColumn('period_end', 'timestamptz', false, { indexed: true }),
    expectedColumn('status', 'text', false, { allowedValues: ['success', 'partial', 'failed', 'unavailable'] }),
    expectedColumn('received', 'integer', false),
    expectedColumn('inserted', 'integer', false),
    expectedColumn('updated', 'integer', false),
    expectedColumn('failed', 'integer', false),
    expectedColumn('last_source_updated_at', 'timestamptz', true, { indexed: true }),
    expectedColumn('started_at', 'timestamptz', false, { indexed: true }),
    expectedColumn('finished_at', 'timestamptz', true, { indexed: true }),
    expectedColumn('error_message', 'text', true),
  ],
  'public.opa_attendances': [
    expectedColumn('id', 'uuid', false),
    expectedColumn('source_system', 'text', false, { allowedValues: ['opa'] }),
    expectedColumn('source_id', 'text', false, { unique: true, indexed: true }),
    expectedColumn('protocolo', 'text', true),
    expectedColumn('contato_bruto', 'text', true),
    expectedColumn('tipo_identificador', 'text', false),
    expectedColumn('canal', 'text', true),
    expectedColumn('atendente', 'text', true),
    expectedColumn('departamento', 'text', true),
    expectedColumn('status', 'text', true),
    expectedColumn('motivo', 'text', true),
    expectedColumn('avaliacao', 'text', true),
    expectedColumn('fcr', 'boolean', true),
    expectedColumn('data_abertura', 'timestamptz', true, { indexed: true }),
    expectedColumn('data_inicio', 'timestamptz', true, { indexed: true }),
    expectedColumn('data_ultima_interacao', 'timestamptz', true, { indexed: true }),
    expectedColumn('data_finalizacao', 'timestamptz', true, { indexed: true }),
    expectedColumn('status_vinculo', 'text', false),
    expectedColumn('ixc_customer_source_id', 'text', true, { indexed: true }),
    expectedColumn('ixc_contract_source_id', 'text', true, { indexed: true }),
    expectedColumn('source_updated_at', 'timestamptz', true, { indexed: true }),
    expectedColumn('synced_at', 'timestamptz', false, { indexed: true }),
    expectedColumn('sync_run_id', 'uuid', true, { indexed: true }),
  ],
  'public.opa_interactions': [
    expectedColumn('id', 'uuid', false),
    expectedColumn('source_system', 'text', false, { allowedValues: ['opa'] }),
    expectedColumn('source_id', 'text', false, { unique: true, indexed: true }),
    expectedColumn('attendance_source_id', 'text', true, { indexed: true }),
    expectedColumn('ixc_customer_source_id', 'text', true, { indexed: true }),
    expectedColumn('ixc_contract_source_id', 'text', true, { indexed: true }),
    expectedColumn('tipo', 'text', true),
    expectedColumn('status', 'text', true),
    expectedColumn('data_interacao', 'timestamptz', true, { indexed: true }),
    expectedColumn('source_updated_at', 'timestamptz', true, { indexed: true }),
    expectedColumn('synced_at', 'timestamptz', false, { indexed: true }),
    expectedColumn('sync_run_id', 'uuid', true, { indexed: true }),
  ],
  'public.ixc_customers': [
    expectedColumn('id', 'uuid', false),
    expectedColumn('source_system', 'text', false, { allowedValues: ['ixc'] }),
    expectedColumn('source_id', 'text', false, { unique: true, indexed: true }),
    expectedColumn('source_updated_at', 'timestamptz', true, { indexed: true }),
    expectedColumn('synced_at', 'timestamptz', false, { indexed: true }),
    expectedColumn('sync_run_id', 'uuid', true, { indexed: true }),
  ],
  'public.ixc_contracts': [
    expectedColumn('id', 'uuid', false),
    expectedColumn('source_system', 'text', false, { allowedValues: ['ixc'] }),
    expectedColumn('source_id', 'text', false, { unique: true, indexed: true }),
    expectedColumn('customer_source_id', 'text', true, { indexed: true }),
    expectedColumn('status', 'text', true),
    expectedColumn('data_ativacao', 'timestamptz', true, { indexed: true }),
    expectedColumn('source_updated_at', 'timestamptz', true, { indexed: true }),
    expectedColumn('synced_at', 'timestamptz', false, { indexed: true }),
    expectedColumn('sync_run_id', 'uuid', true, { indexed: true }),
  ],
  'public.ixc_sales': [
    expectedColumn('id', 'uuid', false),
    expectedColumn('source_system', 'text', false, { allowedValues: ['ixc'] }),
    expectedColumn('source_id', 'text', false, { unique: true, indexed: true }),
    expectedColumn('customer_source_id', 'text', true, { indexed: true }),
    expectedColumn('contract_source_id', 'text', true, { indexed: true }),
    expectedColumn('status', 'text', true),
    expectedColumn('data_venda', 'timestamptz', true, { indexed: true }),
    expectedColumn('source_updated_at', 'timestamptz', true, { indexed: true }),
    expectedColumn('synced_at', 'timestamptz', false, { indexed: true }),
    expectedColumn('sync_run_id', 'uuid', true, { indexed: true }),
  ],
  'public.ixc_cancellations': [
    expectedColumn('id', 'uuid', false),
    expectedColumn('source_system', 'text', false, { allowedValues: ['ixc'] }),
    expectedColumn('source_id', 'text', false, { unique: true, indexed: true }),
    expectedColumn('contract_source_id', 'text', true, { indexed: true }),
    expectedColumn('motivo', 'text', true),
    expectedColumn('tipo', 'text', true),
    expectedColumn('data_cancelamento', 'timestamptz', true, { indexed: true }),
    expectedColumn('source_updated_at', 'timestamptz', true, { indexed: true }),
    expectedColumn('synced_at', 'timestamptz', false, { indexed: true }),
    expectedColumn('sync_run_id', 'uuid', true, { indexed: true }),
  ],
  'public.analytics_sync_status': [
    expectedColumn('id', 'uuid', false),
    expectedColumn('source_system', 'text', false),
    expectedColumn('period_start', 'timestamptz', false, { indexed: true }),
    expectedColumn('period_end', 'timestamptz', false, { indexed: true }),
    expectedColumn('status', 'text', false, { allowedValues: ['success', 'partial', 'failed', 'unavailable'] }),
    expectedColumn('received', 'integer', false),
    expectedColumn('inserted', 'integer', false),
    expectedColumn('updated', 'integer', false),
    expectedColumn('failed', 'integer', false),
    expectedColumn('last_source_updated_at', 'timestamptz', true, { indexed: true }),
    expectedColumn('synced_at', 'timestamptz', false, { indexed: true }),
    expectedColumn('error_message', 'text', true),
    expectedColumn('sync_run_id', 'uuid', true, { indexed: true }),
  ],
};

const expectedRawSourceIdColumns: Record<string, ExpectedColumn> = {
  'integration.opa_records_raw': expectedColumn('source_id', 'text', false, { unique: true, indexed: true }),
  'integration.ixc_records_raw': expectedColumn('source_id', 'text', false, { unique: true, indexed: true }),
};

function findTable(qualifiedName: string) {
  const [schema, name] = qualifiedName.split('.');
  const tables = schema === 'public'
    ? analyticsDatabaseManifest.public
    : analyticsDatabaseManifest.integration;
  const table = tables.find((candidate) => candidate.name === name);
  assert.ok(table, `tabela ausente no manifesto: ${qualifiedName}`);
  return table;
}

function findColumn(tableName: string, columnName: string) {
  const column = findTable(tableName).columns.find((candidate) => candidate.name === columnName);
  assert.ok(column, `coluna ausente no manifesto: ${tableName}.${columnName}`);
  return column;
}

function canonicalColumn(column: {
  name: string;
  type: string;
  nullable: boolean;
  unique?: boolean;
  indexed?: boolean;
  payload?: boolean;
  allowedValues?: readonly string[];
}): ExpectedColumn {
  return {
    name: column.name,
    type: column.type,
    nullable: column.nullable,
    unique: column.unique as boolean,
    indexed: column.indexed as boolean,
    payload: column.payload as boolean,
    ...(column.allowedValues === undefined ? {} : { allowedValues: [...column.allowedValues] }),
  };
}

test('manifesto lista exatamente as tabelas de integração e public', () => {
  assert.deepEqual(
    analyticsDatabaseManifest.integration.map((table) => table.name),
    expectedIntegrationTables,
  );
  assert.deepEqual(
    analyticsDatabaseManifest.public.map((table) => table.name),
    expectedPublicTables,
  );
});

test('manifesto lista exatamente as seis entidades com source_id único', () => {
  assert.deepEqual(analyticsDatabaseManifest.uniqueSourceIdTables, expectedUniqueSourceIdTables);

  for (const tableName of expectedUniqueSourceIdTables) {
    const sourceId = findColumn(tableName, 'source_id');
    assert.deepEqual(
      {
        type: sourceId.type,
        nullable: sourceId.nullable,
        unique: sourceId.unique,
        indexed: sourceId.indexed,
      },
      { type: 'text', nullable: false, unique: true, indexed: true },
    );
  }
});

test('manifesto lista exatamente os campos mínimos de cada tabela', () => {
  assert.deepEqual(Object.keys(expectedRequiredColumns).sort(), [
    ...expectedIntegrationTables.map((name) => `integration.${name}`),
    ...expectedPublicTables.map((name) => `public.${name}`),
  ].sort());

  for (const [tableName, expectedColumns] of Object.entries(expectedRequiredColumns)) {
    assert.deepEqual(findTable(tableName).requiredColumns, expectedColumns);
    for (const columnName of expectedColumns) {
      assert.ok(findTable(tableName).columns.some((column) => column.name === columnName));
    }
  }
});

test('manifesto fecha a lista completa e os atributos de cada coluna', () => {
  assert.deepEqual(Object.keys(expectedColumnsByTable).sort(), [
    ...expectedIntegrationTables.map((name) => `integration.${name}`),
    ...expectedPublicTables.map((name) => `public.${name}`),
  ].sort());

  for (const [tableName, expectedColumns] of Object.entries(expectedColumnsByTable)) {
    assert.deepEqual(
      findTable(tableName).columns.map(canonicalColumn),
      expectedColumns,
      `colunas divergentes em ${tableName}`,
    );
  }
});

test('source_id das duas tabelas raw é text, not null, unique e indexado', () => {
  for (const [tableName, expectedSourceId] of Object.entries(expectedRawSourceIdColumns)) {
    assert.deepEqual(canonicalColumn(findColumn(tableName, 'source_id')), expectedSourceId);
  }
});

test('manifesto atribui tipos aos identificadores, datas e payloads mínimos', () => {
  const expectedColumnTypes: Record<string, string> = {
    'integration.opa_records_raw.id': 'uuid',
    'integration.opa_records_raw.source_id': 'text',
    'integration.opa_records_raw.payload': 'jsonb',
    'integration.ixc_records_raw.id': 'uuid',
    'integration.ixc_records_raw.source_id': 'text',
    'integration.ixc_records_raw.payload': 'jsonb',
    'integration.sync_runs.id': 'uuid',
    'integration.sync_runs.request_id': 'text',
    'integration.sync_runs.period_start': 'timestamptz',
    'integration.sync_runs.period_end': 'timestamptz',
    'integration.sync_runs.status': 'text',
    'public.opa_attendances.id': 'uuid',
    'public.opa_attendances.source_id': 'text',
    'public.opa_attendances.source_system': 'text',
    'public.opa_attendances.contato_bruto': 'text',
    'public.opa_attendances.data_abertura': 'timestamptz',
    'public.opa_interactions.id': 'uuid',
    'public.opa_interactions.source_id': 'text',
    'public.opa_interactions.source_system': 'text',
    'public.opa_interactions.data_interacao': 'timestamptz',
    'public.ixc_customers.id': 'uuid',
    'public.ixc_customers.source_id': 'text',
    'public.ixc_customers.source_system': 'text',
    'public.ixc_contracts.id': 'uuid',
    'public.ixc_contracts.source_id': 'text',
    'public.ixc_contracts.source_system': 'text',
    'public.ixc_contracts.customer_source_id': 'text',
    'public.ixc_contracts.data_ativacao': 'timestamptz',
    'public.ixc_sales.id': 'uuid',
    'public.ixc_sales.source_id': 'text',
    'public.ixc_sales.source_system': 'text',
    'public.ixc_sales.customer_source_id': 'text',
    'public.ixc_sales.contract_source_id': 'text',
    'public.ixc_sales.data_venda': 'timestamptz',
    'public.ixc_cancellations.id': 'uuid',
    'public.ixc_cancellations.source_id': 'text',
    'public.ixc_cancellations.source_system': 'text',
    'public.ixc_cancellations.contract_source_id': 'text',
    'public.ixc_cancellations.data_cancelamento': 'timestamptz',
    'public.analytics_sync_status.id': 'uuid',
    'public.analytics_sync_status.period_start': 'timestamptz',
    'public.analytics_sync_status.period_end': 'timestamptz',
    'public.analytics_sync_status.status': 'text',
  };

  for (const [columnName, expectedType] of Object.entries(expectedColumnTypes)) {
    assert.equal(findColumn(columnName.slice(0, columnName.lastIndexOf('.')), columnName.slice(columnName.lastIndexOf('.') + 1)).type, expectedType);
  }
});

test('manifesto declara tipos e campos mínimos, incluindo contato_bruto', () => {
  assert.deepEqual(findTable('public.opa_attendances').requiredColumns, [
    'id',
    'source_system',
    'source_id',
    'protocolo',
    'contato_bruto',
    'tipo_identificador',
    'canal',
    'status_vinculo',
    'data_abertura',
    'data_finalizacao',
    'source_updated_at',
    'synced_at',
    'sync_run_id',
  ]);
  assert.deepEqual(
    {
      type: findColumn('public.opa_attendances', 'contato_bruto').type,
      nullable: findColumn('public.opa_attendances', 'contato_bruto').nullable,
    },
    { type: 'text', nullable: true },
  );
  assert.deepEqual(findTable('public.ixc_contracts').requiredColumns, [
    'id',
    'source_system',
    'source_id',
    'customer_source_id',
    'status',
    'data_ativacao',
    'source_updated_at',
    'synced_at',
    'sync_run_id',
  ]);
  assert.deepEqual(findTable('public.ixc_sales').requiredColumns, [
    'id',
    'source_system',
    'source_id',
    'customer_source_id',
    'contract_source_id',
    'status',
    'data_venda',
    'source_updated_at',
    'synced_at',
    'sync_run_id',
  ]);
});

test('manifesto mantém payload jsonb somente nas tabelas raw', () => {
  const payloadColumns = [
    ...analyticsDatabaseManifest.integration,
    ...analyticsDatabaseManifest.public,
  ].flatMap((table) => table.columns
    .filter((column) => column.type === 'jsonb' || column.payload === true)
    .map((column) => `${table.schema}.${table.name}.${column.name}`));

  assert.deepEqual(payloadColumns, [
    'integration.opa_records_raw.payload',
    'integration.ixc_records_raw.payload',
  ]);
  assert.equal(findColumn('integration.opa_records_raw', 'payload').type, 'jsonb');
  assert.equal(findColumn('integration.ixc_records_raw', 'payload').type, 'jsonb');
  assert.equal(
    analyticsDatabaseManifest.public.some((table) => table.columns.some((column) => column.type === 'jsonb')),
    false,
  );
});

test('manifesto exige request_id único e estados fechados nas duas tabelas de sync', () => {
  const expectedStatuses = ['success', 'partial', 'failed', 'unavailable'];
  for (const tableName of ['integration.sync_runs', 'public.analytics_sync_status']) {
    const status = findColumn(tableName, 'status');
    assert.equal(status.type, 'text');
    assert.equal(status.nullable, false);
    assert.deepEqual(status.allowedValues, expectedStatuses);
  }

  const requestId = findColumn('integration.sync_runs', 'request_id');
  assert.deepEqual(
    { type: requestId.type, nullable: requestId.nullable, unique: requestId.unique, indexed: requestId.indexed },
    { type: 'text', nullable: false, unique: true, indexed: true },
  );
  assert.deepEqual(findTable('public.analytics_sync_status').uniqueConstraints, [[
    'source_system',
    'period_start',
    'period_end',
  ]]);
});

test('manifesto indexa os campos de período e proveniência esperados', () => {
  for (const table of [
    ...analyticsDatabaseManifest.public,
    ...analyticsDatabaseManifest.integration,
  ]) {
    for (const column of table.columns) {
      if (
        column.name.startsWith('data_')
        || column.name.startsWith('period_')
        || column.name === 'source_updated_at'
        || column.name === 'synced_at'
        || column.name === 'received_at'
        || column.name === 'started_at'
        || column.name === 'finished_at'
      ) {
        assert.equal(column.indexed, true, `${table.schema}.${table.name}.${column.name} sem índice`);
      }
    }
  }
});

test('manifesto fecha relações opcionais por source_id, sem FK na migration inicial', () => {
  assert.deepEqual(
    analyticsDatabaseManifest.relations
      .filter((relation) => relation.targetColumn === 'source_id')
      .map((relation) => `${relation.fromTable}.${relation.column}->${relation.toTable}.${relation.targetColumn}`),
    expectedSourceRelations,
  );

  for (const relation of analyticsDatabaseManifest.relations) {
    const column = findColumn(relation.fromTable, relation.column);
    assert.equal(column.type, relation.columnType);
    assert.equal(column.nullable, true);
    assert.equal(column.indexed, true);
    assert.equal(relation.foreignKey, 'deferred-initial-migration');
    assert.equal(relation.nullable, true);
  }
});

test('manifesto exige isolamento por RLS e nega acesso direto por anon/authenticated', () => {
  for (const table of [
    ...analyticsDatabaseManifest.public,
    ...analyticsDatabaseManifest.integration,
  ]) {
    assert.equal(table.access.rlsRequired, true, `${table.schema}.${table.name} sem RLS`);
    assert.equal(table.access.defaultPolicies, 'deny');
    assert.deepEqual(table.access.policies, []);
    assert.deepEqual(table.access.deniedRoles, ['anon', 'authenticated']);
  }

  for (const table of analyticsDatabaseManifest.integration) {
    assert.equal(table.access.dataApiExposed, false);
  }
  assert.equal(findTable('integration.opa_records_raw').access.dataApiExposed, false);
  assert.equal(findTable('integration.ixc_records_raw').access.dataApiExposed, false);
  assert.equal(findTable('integration.sync_runs').access.dataApiExposed, false);
});

test('manifesto documenta o alvo de REVOKE e default privileges', () => {
  assert.deepEqual(analyticsSecuritySqlTarget, [
    'REVOKE ALL ON SCHEMA integration FROM anon, authenticated;',
    'REVOKE ALL ON ALL TABLES IN SCHEMA integration FROM anon, authenticated;',
    'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA integration REVOKE ALL ON TABLES FROM anon, authenticated;',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;',
  ]);
});
