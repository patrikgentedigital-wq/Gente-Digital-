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
