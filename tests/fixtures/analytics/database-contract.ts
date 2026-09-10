export const analyticsTableContract = {
  integration: ['opa_records_raw', 'ixc_records_raw', 'sync_runs'],
  public: [
    'opa_attendances',
    'opa_interactions',
    'ixc_customers',
    'ixc_contracts',
    'ixc_sales',
    'ixc_cancellations',
    'analytics_sync_status',
  ],
  syncStatuses: ['success', 'partial', 'failed', 'unavailable'],
  uniqueSourceIdTables: [
    'opa_attendances',
    'opa_interactions',
    'ixc_customers',
    'ixc_contracts',
    'ixc_sales',
    'ixc_cancellations',
  ],
} as const;
