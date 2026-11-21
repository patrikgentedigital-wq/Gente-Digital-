import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readCommercialIxcPage } from '../../lib/analytics/commercial-ixc-read';

const url = 'https://ixc.example.test/webservice/v1/cliente_contrato';
const auth = 'Basic test';
const body = { page: '1', rp: '250' };

test('repete a mesma leitura após timeout ou indisponibilidade temporária', async () => {
  for (const failure of ['timeout', '503']) {
    let attempts = 0;
    const result = await readCommercialIxcPage(url, auth, body, Date.now() + 2_000, async (target, options) => {
      assert.equal(target, url);
      assert.equal(options?.method, 'POST');
      assert.equal(new Headers(options?.headers).get('ixcsoft'), 'listar');
      assert.equal(options?.body, JSON.stringify(body));
      attempts += 1;
      if (attempts === 1) {
        if (failure === 'timeout') throw new DOMException('Timeout', 'TimeoutError');
        return new Response(null, { status: 503 });
      }
      return Response.json({ total: '0' });
    });
    assert.deepEqual(result, { total: '0' });
    assert.equal(attempts, 2);
  }
});

test('não repete falha de autorização e respeita o limite de tentativas', async () => {
  for (const [status, expectedAttempts] of [[401, 1], [502, 2]]) {
    let attempts = 0;
    await assert.rejects(readCommercialIxcPage(url, auth, body, Date.now() + 2_000, async () => {
      attempts += 1;
      return new Response(null, { status });
    }), /Falha na consulta ao IXC/);
    assert.equal(attempts, expectedAttempts);
  }
});

test('permite recuperar a leitura comercial após dois timeouts sucessivos', async () => {
  let attempts = 0;
  const result = await readCommercialIxcPage(url, auth, body, Date.now() + 2_000, async () => {
    attempts += 1;
    if (attempts < 3) throw new DOMException('Timeout', 'TimeoutError');
    return Response.json({ total: '0' });
  }, 3);
  assert.deepEqual(result, { total: '0' });
  assert.equal(attempts, 3);
});
