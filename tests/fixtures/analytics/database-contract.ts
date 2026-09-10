export type AnalyticsSchema = 'integration' | 'public';
export type AnalyticsColumnType =
  | 'uuid'
  | 'text'
  | 'boolean'
  | 'integer'
  | 'date'
  | 'timestamptz'
  | 'jsonb';
export type AnalyticsRole = 'anon' | 'authenticated';
export type AnalyticsIntegrationTableName =
  | 'opa_records_raw'
  | 'ixc_records_raw'
  | 'sync_runs';
export type AnalyticsPublicTableName =
  | 'opa_attendances'
  | 'opa_interactions'
  | 'ixc_customers'
  | 'ixc_contracts'
  | 'ixc_sales'
  | 'ixc_cancellations'
  | 'analytics_sync_status';
export type AnalyticsTableName =
  | AnalyticsIntegrationTableName
  | AnalyticsPublicTableName;
export type AnalyticsQualifiedTableName = `${AnalyticsSchema}.${AnalyticsTableName}`;

export interface AnalyticsColumnContract {
  name: string;
  type: AnalyticsColumnType;
  nullable: boolean;
  unique?: boolean;
  indexed?: boolean;
  payload?: boolean;
  allowedValues?: readonly string[];
}

export interface AnalyticsAccessContract {
  rlsRequired: boolean;
  dataApiExposed: boolean;
  defaultPolicies: 'deny';
  policies: readonly [];
  deniedRoles: readonly [AnalyticsRole, AnalyticsRole];
}

export interface AnalyticsTableContract {
  schema: AnalyticsSchema;
  name: AnalyticsTableName;
  requiredColumns: readonly string[];
  columns: readonly AnalyticsColumnContract[];
  access: AnalyticsAccessContract;
  uniqueConstraints?: readonly (readonly string[])[];
}

export interface AnalyticsRelationContract {
  fromTable: AnalyticsQualifiedTableName;
  column: string;
  columnType: 'text' | 'uuid';
  nullable: true;
  indexed: true;
  toTable: AnalyticsQualifiedTableName;
  targetColumn: 'source_id' | 'id';
  foreignKey: 'deferred-initial-migration';
}

export interface AnalyticsDatabaseManifest {
  integration: readonly AnalyticsTableContract[];
  public: readonly AnalyticsTableContract[];
  uniqueSourceIdTables: readonly AnalyticsQualifiedTableName[];
  relations: readonly AnalyticsRelationContract[];
  syncStatuses: readonly ['success', 'partial', 'failed', 'unavailable'];
}

type ColumnOptions = Omit<AnalyticsColumnContract, 'name' | 'type' | 'nullable'>;

const column = (
  name: string,
  type: AnalyticsColumnType,
  nullable: boolean,
  options: ColumnOptions = {},
): AnalyticsColumnContract => ({ name, type, nullable, ...options });

const sourceId = () => column('source_id', 'text', false, { unique: true, indexed: true });
const syncRunId = () => column('sync_run_id', 'uuid', true, { indexed: true });
const sourceUpdatedAt = () => column('source_updated_at', 'timestamptz', true, { indexed: true });
const syncedAt = () => column('synced_at', 'timestamptz', false, { indexed: true });

const integrationAccess: AnalyticsAccessContract = {
  rlsRequired: true,
  dataApiExposed: false,
  defaultPolicies: 'deny',
  policies: [],
  deniedRoles: ['anon', 'authenticated'],
};

const publicAccess: AnalyticsAccessContract = {
  rlsRequired: true,
  dataApiExposed: true,
  defaultPolicies: 'deny',
  policies: [],
  deniedRoles: ['anon', 'authenticated'],
};

const syncStatuses = ['success', 'partial', 'failed', 'unavailable'] as const;

const opaRecordsRaw: AnalyticsTableContract = {
  schema: 'integration',
  name: 'opa_records_raw',
  requiredColumns: [
    'id',
    'source_id',
    'source_system',
    'record_type',
    'payload',
    'received_at',
    'sync_run_id',
  ],
  columns: [
    column('id', 'uuid', false),
    sourceId(),
    column('source_system', 'text', false),
    column('record_type', 'text', false),
    column('payload', 'jsonb', false, { payload: true }),
    sourceUpdatedAt(),
    column('received_at', 'timestamptz', false, { indexed: true }),
    syncRunId(),
  ],
  access: integrationAccess,
};

const ixcRecordsRaw: AnalyticsTableContract = {
  schema: 'integration',
  name: 'ixc_records_raw',
  requiredColumns: [
    'id',
    'source_id',
    'source_system',
    'record_type',
    'payload',
    'received_at',
    'sync_run_id',
  ],
  columns: [
    column('id', 'uuid', false),
    sourceId(),
    column('source_system', 'text', false),
    column('record_type', 'text', false),
    column('payload', 'jsonb', false, { payload: true }),
    sourceUpdatedAt(),
    column('received_at', 'timestamptz', false, { indexed: true }),
    syncRunId(),
  ],
  access: integrationAccess,
};

const syncRuns: AnalyticsTableContract = {
  schema: 'integration',
  name: 'sync_runs',
  requiredColumns: [
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
  columns: [
    column('id', 'uuid', false),
    column('source_system', 'text', false),
    column('request_id', 'text', false, { unique: true, indexed: true }),
    column('period_start', 'timestamptz', false, { indexed: true }),
    column('period_end', 'timestamptz', false, { indexed: true }),
    column('status', 'text', false, { allowedValues: syncStatuses }),
    column('received', 'integer', false),
    column('inserted', 'integer', false),
    column('updated', 'integer', false),
    column('failed', 'integer', false),
    column('last_source_updated_at', 'timestamptz', true, { indexed: true }),
    column('started_at', 'timestamptz', false, { indexed: true }),
    column('finished_at', 'timestamptz', true, { indexed: true }),
    column('error_message', 'text', true),
  ],
  access: integrationAccess,
};

const opaAttendances: AnalyticsTableContract = {
  schema: 'public',
  name: 'opa_attendances',
  requiredColumns: [
    'id',
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
  columns: [
    column('id', 'uuid', false),
    sourceId(),
    column('protocolo', 'text', true),
    column('contato_bruto', 'text', true),
    column('tipo_identificador', 'text', false),
    column('canal', 'text', true),
    column('atendente', 'text', true),
    column('departamento', 'text', true),
    column('status', 'text', true),
    column('motivo', 'text', true),
    column('avaliacao', 'text', true),
    column('fcr', 'boolean', true),
    column('data_abertura', 'timestamptz', true, { indexed: true }),
    column('data_inicio', 'timestamptz', true, { indexed: true }),
    column('data_ultima_interacao', 'timestamptz', true, { indexed: true }),
    column('data_finalizacao', 'timestamptz', true, { indexed: true }),
    column('status_vinculo', 'text', false),
    column('ixc_customer_source_id', 'text', true, { indexed: true }),
    column('ixc_contract_source_id', 'text', true, { indexed: true }),
    sourceUpdatedAt(),
    syncedAt(),
    syncRunId(),
  ],
  access: publicAccess,
};

const opaInteractions: AnalyticsTableContract = {
  schema: 'public',
  name: 'opa_interactions',
  requiredColumns: [
    'id',
    'source_id',
    'attendance_source_id',
    'ixc_customer_source_id',
    'ixc_contract_source_id',
    'data_interacao',
    'source_updated_at',
    'synced_at',
    'sync_run_id',
  ],
  columns: [
    column('id', 'uuid', false),
    sourceId(),
    column('attendance_source_id', 'text', true, { indexed: true }),
    column('ixc_customer_source_id', 'text', true, { indexed: true }),
    column('ixc_contract_source_id', 'text', true, { indexed: true }),
    column('tipo', 'text', true),
    column('status', 'text', true),
    column('data_interacao', 'timestamptz', true, { indexed: true }),
    sourceUpdatedAt(),
    syncedAt(),
    syncRunId(),
  ],
  access: publicAccess,
};

const ixcCustomers: AnalyticsTableContract = {
  schema: 'public',
  name: 'ixc_customers',
  requiredColumns: ['id', 'source_id', 'source_updated_at', 'synced_at', 'sync_run_id'],
  columns: [
    column('id', 'uuid', false),
    sourceId(),
    sourceUpdatedAt(),
    syncedAt(),
    syncRunId(),
  ],
  access: publicAccess,
};

const ixcContracts: AnalyticsTableContract = {
  schema: 'public',
  name: 'ixc_contracts',
  requiredColumns: [
    'id',
    'source_id',
    'customer_source_id',
    'status',
    'data_ativacao',
    'source_updated_at',
    'synced_at',
    'sync_run_id',
  ],
  columns: [
    column('id', 'uuid', false),
    sourceId(),
    column('customer_source_id', 'text', true, { indexed: true }),
    column('status', 'text', true),
    column('data_ativacao', 'timestamptz', true, { indexed: true }),
    sourceUpdatedAt(),
    syncedAt(),
    syncRunId(),
  ],
  access: publicAccess,
};

const ixcSales: AnalyticsTableContract = {
  schema: 'public',
  name: 'ixc_sales',
  requiredColumns: [
    'id',
    'source_id',
    'customer_source_id',
    'contract_source_id',
    'status',
    'data_venda',
    'source_updated_at',
    'synced_at',
    'sync_run_id',
  ],
  columns: [
    column('id', 'uuid', false),
    sourceId(),
    column('customer_source_id', 'text', true, { indexed: true }),
    column('contract_source_id', 'text', true, { indexed: true }),
    column('status', 'text', true),
    column('data_venda', 'timestamptz', true, { indexed: true }),
    sourceUpdatedAt(),
    syncedAt(),
    syncRunId(),
  ],
  access: publicAccess,
};

const ixcCancellations: AnalyticsTableContract = {
  schema: 'public',
  name: 'ixc_cancellations',
  requiredColumns: [
    'id',
    'source_id',
    'contract_source_id',
    'motivo',
    'tipo',
    'data_cancelamento',
    'source_updated_at',
    'synced_at',
    'sync_run_id',
  ],
  columns: [
    column('id', 'uuid', false),
    sourceId(),
    column('contract_source_id', 'text', true, { indexed: true }),
    column('motivo', 'text', true),
    column('tipo', 'text', true),
    column('data_cancelamento', 'timestamptz', true, { indexed: true }),
    sourceUpdatedAt(),
    syncedAt(),
    syncRunId(),
  ],
  access: publicAccess,
};

const analyticsSyncStatus: AnalyticsTableContract = {
  schema: 'public',
  name: 'analytics_sync_status',
  requiredColumns: [
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
  columns: [
    column('id', 'uuid', false),
    column('source_system', 'text', false),
    column('period_start', 'timestamptz', false, { indexed: true }),
    column('period_end', 'timestamptz', false, { indexed: true }),
    column('status', 'text', false, { allowedValues: syncStatuses }),
    column('received', 'integer', false),
    column('inserted', 'integer', false),
    column('updated', 'integer', false),
    column('failed', 'integer', false),
    column('last_source_updated_at', 'timestamptz', true, { indexed: true }),
    syncedAt(),
    column('error_message', 'text', true),
    syncRunId(),
  ],
  access: publicAccess,
  uniqueConstraints: [['source_system', 'period_start', 'period_end']],
};

const sourceRelation = (
  fromTable: AnalyticsQualifiedTableName,
  columnName: string,
  toTable: AnalyticsQualifiedTableName,
): AnalyticsRelationContract => ({
  fromTable,
  column: columnName,
  columnType: 'text',
  nullable: true,
  indexed: true,
  toTable,
  targetColumn: 'source_id',
  foreignKey: 'deferred-initial-migration',
});

const syncRunRelation = (
  fromTable: AnalyticsQualifiedTableName,
): AnalyticsRelationContract => ({
  fromTable,
  column: 'sync_run_id',
  columnType: 'uuid',
  nullable: true,
  indexed: true,
  toTable: 'integration.sync_runs',
  targetColumn: 'id',
  foreignKey: 'deferred-initial-migration',
});

export const analyticsSecuritySqlTarget = [
  'REVOKE ALL ON SCHEMA integration FROM anon, authenticated;',
  'REVOKE ALL ON ALL TABLES IN SCHEMA integration FROM anon, authenticated;',
  'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA integration REVOKE ALL ON TABLES FROM anon, authenticated;',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;',
] as const;

export const analyticsDatabaseManifest: AnalyticsDatabaseManifest = {
  integration: [opaRecordsRaw, ixcRecordsRaw, syncRuns],
  public: [
    opaAttendances,
    opaInteractions,
    ixcCustomers,
    ixcContracts,
    ixcSales,
    ixcCancellations,
    analyticsSyncStatus,
  ],
  uniqueSourceIdTables: [
    'public.opa_attendances',
    'public.opa_interactions',
    'public.ixc_customers',
    'public.ixc_contracts',
    'public.ixc_sales',
    'public.ixc_cancellations',
  ],
  relations: [
    sourceRelation('public.opa_attendances', 'ixc_customer_source_id', 'public.ixc_customers'),
    sourceRelation('public.opa_attendances', 'ixc_contract_source_id', 'public.ixc_contracts'),
    sourceRelation('public.opa_interactions', 'attendance_source_id', 'public.opa_attendances'),
    sourceRelation('public.opa_interactions', 'ixc_customer_source_id', 'public.ixc_customers'),
    sourceRelation('public.opa_interactions', 'ixc_contract_source_id', 'public.ixc_contracts'),
    sourceRelation('public.ixc_contracts', 'customer_source_id', 'public.ixc_customers'),
    sourceRelation('public.ixc_sales', 'customer_source_id', 'public.ixc_customers'),
    sourceRelation('public.ixc_sales', 'contract_source_id', 'public.ixc_contracts'),
    sourceRelation('public.ixc_cancellations', 'contract_source_id', 'public.ixc_contracts'),
    syncRunRelation('integration.opa_records_raw'),
    syncRunRelation('integration.ixc_records_raw'),
    syncRunRelation('public.opa_attendances'),
    syncRunRelation('public.opa_interactions'),
    syncRunRelation('public.ixc_customers'),
    syncRunRelation('public.ixc_contracts'),
    syncRunRelation('public.ixc_sales'),
    syncRunRelation('public.ixc_cancellations'),
    syncRunRelation('public.analytics_sync_status'),
  ],
  syncStatuses,
};
