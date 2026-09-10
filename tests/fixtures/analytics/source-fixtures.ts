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
  data_referencia: '2026-09-01',
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
