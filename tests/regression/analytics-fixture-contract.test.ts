import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generalMetricFixture,
  ixcCancellationFixture,
  ixcContractFixture,
  ixcCustomerFixture,
  opaAttendanceFixture,
} from '../fixtures/analytics/source-fixtures';

test('fixtures analíticos declaram origem, identificador e data de referência', () => {
  for (const fixture of [opaAttendanceFixture, ixcCustomerFixture, ixcContractFixture, ixcCancellationFixture, generalMetricFixture]) {
    assert.equal(typeof fixture.source_system, 'string');
    assert.equal(typeof fixture.source_id, 'string');
    assert.ok(fixture.source_id.length > 0);
  }

  assert.equal(typeof opaAttendanceFixture.data_abertura, 'string');
  assert.equal(typeof opaAttendanceFixture.status_vinculo, 'string');
  assert.equal(opaAttendanceFixture.status_vinculo, 'nao_vinculado');

  assert.equal(typeof ixcCustomerFixture.data_referencia, 'string');
  assert.equal(typeof ixcContractFixture.data_ativacao, 'string');
  assert.equal(ixcContractFixture.customer_source_id, ixcCustomerFixture.source_id);
  assert.equal(typeof ixcCancellationFixture.data_cancelamento, 'string');
  assert.equal(ixcCancellationFixture.contract_source_id, ixcContractFixture.source_id);
  assert.equal(typeof generalMetricFixture.reference_date, 'string');
});
