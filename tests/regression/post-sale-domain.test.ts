import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  duplicatePhoneIndexes,
  isValidPhoneDigits,
  normalizePhoneDigits,
} from '@/lib/post-sale/phones';
import {
  buildPostSaleMetrics,
  parseIxcDate,
} from '@/lib/post-sale/metrics';
import {
  createIxcGateway,
  reconcileContractsForContacts,
  validateOriginContract,
} from '@/lib/post-sale/ixc';
import type {
  IxcClientRecord,
  IxcContractRecord,
  IxcGateway,
} from '@/lib/post-sale/contracts';

const phoneA = '91987654321';
const window = {
  collection: { start: '2026-09-01', end: '2026-09-30' },
  conversion: { start: '2026-09-01', end: '2026-09-30' },
};

function contact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contact-1',
    collectionId: 'collection-1',
    name: 'Ana Lima',
    phoneRaw: '(91) 98765-4321',
    phoneNormalized: phoneA,
    state: 'created_lead' as const,
    reason: null,
    leadId: 101,
    originSoldAt: '2026-09-10T12:00:00.000Z',
    createdAt: '2026-09-10T13:00:00.000Z',
    leadStatus: 'Pendente',
    firstAttendanceAt: '2026-09-10T13:15:00.000Z',
    ...overrides,
  };
}

function gateway(overrides: Partial<IxcGateway> = {}): IxcGateway {
  const contractRecord: IxcContractRecord = {
    id: '000456',
    clientId: 'client-9',
    status: 'A',
    activatedAt: '2026-09-11 09:30:00',
  };
  const clientRecord: IxcClientRecord = {
    id: 'client-9',
    name: 'Ana Lima',
    phones: [phoneA],
  };

  return {
    getContractsById: async () => [contractRecord],
    getClientsById: async () => [clientRecord],
    findClientsByName: async () => [clientRecord],
    listContractsByClientId: async () => [contractRecord],
    ...overrides,
  };
}

test('normaliza telefone para dígitos e aplica limites de 10 a 15 dígitos', () => {
  assert.equal(normalizePhoneDigits('+55 (91) 98765-4321'), '5591987654321');
  assert.equal(normalizePhoneDigits('telefone sem números'), '');
  assert.equal(isValidPhoneDigits('9198765432'), true);
  assert.equal(isValidPhoneDigits('5591987654321'), true);
  assert.equal(isValidPhoneDigits('123456789'), false);
  assert.equal(isValidPhoneDigits('1234567890123456'), false);
});

test('detecta repetição por telefone normalizado em formatos diferentes', () => {
  assert.deepEqual(duplicatePhoneIndexes([
    '(91) 98765-4321',
    '91987654321',
    '91 98765.4321',
    '91 91234-5678',
  ]), [1, 2]);
});

test('parseIxcDate aceita datas IXC e rejeita calendário impossível', () => {
  assert.equal(parseIxcDate('2026-09-30'), '2026-09-30T03:00:00.000Z');
  assert.equal(parseIxcDate('30/09/2026 09:30:00'), '2026-09-30T12:30:00.000Z');
  assert.equal(parseIxcDate('31/02/2026'), null);
  assert.equal(parseIxcDate('data inválida'), null);
});

test('valida contrato de origem pelo ID exato e mantém zeros à esquerda', async () => {
  let queriedId = '';
  const ixc = gateway({
    getContractsById: async (contractId) => {
      queriedId = contractId;
      return [{ id: '0000042', clientId: 'client-9', status: 'A', activatedAt: '2026-09-30' }];
    },
  });

  const verified = await validateOriginContract('0000042', ixc);
  assert.equal(queriedId, '0000042');
  assert.equal(verified.contractId, '0000042');
  assert.equal(verified.customerId, 'client-9');
  assert.equal(verified.customerName, 'Ana Lima');
  assert.equal(verified.soldAt, '2026-09-30T03:00:00.000Z');
});

test('não valida contrato IXC ambíguo, inativo, com data inválida ou ID divergente', async () => {
  await assert.rejects(
    validateOriginContract('0000042', gateway({
      getContractsById: async () => [
        { id: '0000042', clientId: 'client-9', status: 'A', activatedAt: '2026-09-30' },
        { id: '0000042', clientId: 'client-9', status: 'A', activatedAt: '2026-09-30' },
      ],
    })),
    /único/i,
  );
  await assert.rejects(
    validateOriginContract('0000042', gateway({
      getContractsById: async () => [{ id: '0000042', clientId: 'client-9', status: 'I', activatedAt: '2026-09-30' }],
    })),
    /ativo/i,
  );
  await assert.rejects(
    validateOriginContract('0000042', gateway({
      getContractsById: async () => [{ id: '42', clientId: 'client-9', status: 'A', activatedAt: '2026-09-30' }],
    })),
    /exato/i,
  );
  await assert.rejects(
    validateOriginContract('0000042', gateway({
      getContractsById: async () => [{ id: '0000042', clientId: 'client-9', status: 'A', activatedAt: '31/02/2026' }],
    })),
    /data/i,
  );
});

test('gateway IXC usa consulta server-side e envia o ID como string exata', async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const ixc = await createIxcGateway({
    getCredentials: async () => ({
      cleanDomain: 'ixc.example.test',
      authHeader: 'Basic test-only',
      hasCredentials: true,
    }),
    fetchWithTimeout: async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({
        registros: [{ id: '0000042', id_cliente: 'client-9', status: 'A', data: '2026-09-30' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const records = await ixc.getContractsById('0000042');
  assert.equal(calls[0].url, 'https://ixc.example.test/webservice/v1/cliente_contrato');
  assert.equal(calls[0].body.qtype, 'id');
  assert.equal(calls[0].body.query, '0000042');
  assert.equal(calls[0].body.oper, '=');
  assert.equal(records[0].id, '0000042');
});

test('gateway sanitiza erros HTTP sem incluir telefone, payload ou credencial', async () => {
  const secret = 'token-super-secreto';
  const phone = '91987654321';
  const ixc = await createIxcGateway({
    getCredentials: async () => ({ cleanDomain: 'ixc.example.test', authHeader: secret, hasCredentials: true }),
    fetchWithTimeout: async () => new Response(`${secret} ${phone}`, { status: 500 }),
  });

  await assert.rejects(ixc.getContractsById('0000042'), (error: Error) => {
    assert.match(error.message, /IXC/i);
    assert.doesNotMatch(error.message, new RegExp(secret));
    assert.doesNotMatch(error.message, new RegExp(phone));
    return true;
  });
});

test('reconcilia somente telefone único e preserva múltiplos contratos do mesmo contato', async () => {
  const contracts = [
    { id: '000456', clientId: 'client-9', status: 'A', activatedAt: '2026-09-11 09:30:00' },
    { id: '000457', clientId: 'client-9', status: 'A', activatedAt: '2026-09-12 09:30:00' },
    { id: '000458', clientId: 'client-9', status: 'I', activatedAt: '2026-09-12 09:30:00' },
  ];
  const ixc = gateway({
    listContractsByClientId: async () => contracts,
    getContractsById: async (id) => contracts.filter((candidate) => candidate.id === id),
  });
  const results = await reconcileContractsForContacts([contact()], ixc);

  assert.deepEqual(results.map(({ contractId, contactId, state }) => ({ contractId, contactId, state })), [
    { contractId: '000456', contactId: 'contact-1', state: 'confirmed' },
    { contractId: '000457', contactId: 'contact-1', state: 'confirmed' },
  ]);
  assert.equal(results[0].activatedAt, '2026-09-11T12:30:00.000Z');
});

test('não conta como conversão contrato ativo antes da venda de origem', async () => {
  const priorContract: IxcContractRecord = {
    id: '000455', clientId: 'client-9', status: 'A', activatedAt: '2026-09-09 09:30:00',
  };
  const ixc = gateway({
    listContractsByClientId: async () => [priorContract],
    getContractsById: async () => [priorContract],
  });

  assert.deepEqual(await reconcileContractsForContacts([contact()], ixc), []);
});

test('data de venda limita a ambiguidade a coletas que já existiam na ativação', async () => {
  const futureCollection = contact({
    id: 'contact-future',
    collectionId: 'collection-future',
    originSoldAt: '2026-09-12T12:00:00.000Z',
  });
  const confirmed = await reconcileContractsForContacts([contact(), futureCollection], gateway());
  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0].state, 'confirmed');
  assert.equal(confirmed[0].contactId, 'contact-1');
  assert.equal(confirmed[0].collectionId, 'collection-1');

  const priorCollection = contact({ id: 'contact-prior', collectionId: 'collection-prior' });
  const ambiguous = await reconcileContractsForContacts([contact(), priorCollection], gateway());
  assert.equal(ambiguous.length, 1);
  assert.equal(ambiguous[0].state, 'pending_review');
  assert.equal(ambiguous[0].contactId, null);
  assert.equal(ambiguous[0].collectionId, null);
});

test('reconciliação ambígua vai para revisão e data inválida não gera conversão', async () => {
  const samePhone = contact({ id: 'contact-2', leadId: 102 });
  const ambiguous = await reconcileContractsForContacts([contact(), samePhone], gateway());
  assert.equal(ambiguous.length, 1);
  assert.equal(ambiguous[0].state, 'pending_review');
  assert.equal(ambiguous[0].contactId, null);
  assert.match(ambiguous[0].reason ?? '', /ambígu/i);

  const invalidDate = await reconcileContractsForContacts([contact()], gateway({
    listContractsByClientId: async () => [
      { id: '000456', clientId: 'client-9', status: 'A', activatedAt: '31/02/2026' },
    ],
    getContractsById: async () => [
      { id: '000456', clientId: 'client-9', status: 'A', activatedAt: '31/02/2026' },
    ],
  }));
  assert.deepEqual(invalidDate, []);
});

test('métricas incluem origem sem contatos e representam denominador zero sem percentual falso', () => {
  const result = buildPostSaleMetrics({
    collections: [{
      id: 'collection-1',
      originContractId: '0001',
      soldAt: '2026-09-01T03:00:00.000Z',
      collectorColaboradorId: 'EMP-042',
      outcome: 'no_referral',
    }],
    contacts: [],
    conversions: [],
  }, window);

  assert.equal(result.registeredOriginSales, 1);
  assert.equal(result.contactsReceived, 0);
  assert.equal(result.validContacts, 0);
  assert.equal(result.conversionRate, null);
});

test('métricas contam pendências sem transformar status Ganho em contrato confirmado', () => {
  const result = buildPostSaleMetrics({
    collections: [{
      id: 'collection-1',
      originContractId: '0001',
      soldAt: '2026-09-10T03:00:00.000Z',
      collectorColaboradorId: 'EMP-042',
      outcome: 'contacts_collected',
    }],
    contacts: [contact({ leadStatus: 'Ganho' })],
    conversions: [{
      id: 'conversion-1',
      ixcContractId: '000456',
      contactId: 'contact-1',
      activatedAt: '2026-09-15T03:00:00.000Z',
      verifiedAt: '2026-09-15T03:05:00.000Z',
      state: 'pending_review',
    }],
  }, window);

  assert.equal(result.validContacts, 1);
  assert.equal(result.pendingReviews, 1);
  assert.equal(result.confirmedContracts, 0);
  assert.equal(result.convertedContacts, 0);
  assert.equal(result.leadsInProgress, 0);
});

test('vários contratos confirmados contam um contato convertido e tempo até primeiro atendimento', () => {
  const result = buildPostSaleMetrics({
    collections: [{
      id: 'collection-1',
      originContractId: '0001',
      soldAt: '2026-09-10T03:00:00.000Z',
      collectorColaboradorId: 'EMP-042',
      outcome: 'contacts_collected',
    }],
    contacts: [contact()],
    conversions: [
      {
        id: 'conversion-1', ixcContractId: '000456', contactId: 'contact-1',
        activatedAt: '2026-09-11T03:00:00.000Z', verifiedAt: '2026-09-11T03:05:00.000Z', state: 'confirmed',
      },
      {
        id: 'conversion-2', ixcContractId: '000457', contactId: 'contact-1',
        activatedAt: '2026-09-12T03:00:00.000Z', verifiedAt: '2026-09-12T03:05:00.000Z', state: 'confirmed',
      },
    ],
  }, window);

  assert.equal(result.confirmedContracts, 2);
  assert.equal(result.convertedContacts, 1);
  assert.equal(result.conversionRate, 1);
  assert.equal(result.averageMinutesToFirstAttendance, 15);
});

test('períodos independentes filtram por dia local inclusivo de São Paulo', () => {
  const result = buildPostSaleMetrics({
    collections: [
      {
        id: 'collection-in', originContractId: '0001', soldAt: '2026-08-02T02:59:59.999Z',
        collectorColaboradorId: 'EMP-042', outcome: 'contacts_collected',
      },
      {
        id: 'collection-out', originContractId: '0002', soldAt: '2026-08-02T03:00:00.000Z',
        collectorColaboradorId: 'EMP-042', outcome: 'contacts_collected',
      },
    ],
    contacts: [contact({ collectionId: 'collection-in' }), contact({ id: 'contact-out', collectionId: 'collection-out' })],
    conversions: [
      {
        id: 'conversion-in', ixcContractId: '000456', contactId: 'contact-1',
        activatedAt: '2026-09-02T02:59:59.999Z', verifiedAt: '2026-09-02T03:01:00.000Z', state: 'confirmed',
      },
      {
        id: 'conversion-out', ixcContractId: '000457', contactId: 'contact-1',
        activatedAt: '2026-09-02T03:00:00.000Z', verifiedAt: '2026-09-02T03:01:00.000Z', state: 'confirmed',
      },
    ],
  }, {
    collection: { start: '2026-08-01', end: '2026-08-01' },
    conversion: { start: '2026-09-01', end: '2026-09-01' },
  });

  assert.equal(result.registeredOriginSales, 1);
  assert.equal(result.validContacts, 1);
  assert.equal(result.confirmedContracts, 1);
  assert.equal(result.convertedContacts, 1);
});

test('métricas ignoram períodos e tempos inválidos sem gerar duração negativa', () => {
  const result = buildPostSaleMetrics({
    collections: [{
      id: 'collection-1', originContractId: '0001', soldAt: 'data inválida',
      collectorColaboradorId: 'EMP-042', outcome: 'contacts_collected',
    }],
    contacts: [contact({
      createdAt: 'data inválida',
      firstAttendanceAt: '2026-09-10T13:00:00.000Z',
      state: 'invalid',
      leadId: null,
    })],
    conversions: [{
      id: 'conversion-1', ixcContractId: '000456', contactId: 'contact-1',
      activatedAt: '31/02/2026', verifiedAt: '2026-09-11T03:05:00.000Z', state: 'confirmed',
    }],
  }, window);

  assert.equal(result.registeredOriginSales, 0);
  assert.equal(result.contactsReceived, 0);
  assert.equal(result.confirmedContracts, 0);
  assert.equal(result.averageMinutesToFirstAttendance, null);
});
