import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createPostSaleHandlers } from '@/lib/post-sale/handlers';
import { filterLegacyRefLeads } from '@/lib/post-sale/lead-scope';
import type { IxcGateway, PostSaleContact } from '@/lib/post-sale/contracts';

const user = {
  id: 'user-1',
  email: 'seller@example.test',
  user_metadata: { role: 'admin' },
};
const conversionId = '11111111-1111-4111-8111-111111111111';
const contactId = '22222222-2222-4222-8222-222222222222';
const collectionId = '33333333-3333-4333-8333-333333333333';

const activeGateway: IxcGateway = {
  getContractsById: async (id) => id === '0000042'
    ? [{ id, clientId: 'ixc-client-9', status: 'A', activatedAt: '2026-09-30' }]
    : [],
  getClientsById: async (id) => id === 'ixc-client-9'
    ? [{ id, name: 'Cliente de origem', phones: ['91987654321'] }]
    : [],
  findClientsByName: async () => [{ id: 'ixc-client-10', name: 'Ana Lima', phones: ['91987654321'] }],
  listContractsByClientId: async () => [],
};

const validContact: PostSaleContact = {
  id: contactId,
  collectionId,
  name: 'Ana Lima',
  phoneRaw: '(91) 98765-4321',
  phoneNormalized: '91987654321',
  state: 'created_lead',
  reason: null,
  leadId: 101,
  originSoldAt: '2026-09-10T12:00:00.000Z',
  createdAt: '2026-09-10T13:00:00.000Z',
  leadStatus: 'Pendente',
};

function makeStore(overrides: Record<string, unknown> = {}) {
  const calls: Record<string, unknown[]> = {
    listDataset: [],
    createCollection: [],
    listReconciliationContacts: [],
    insertConversions: [],
    confirmConversionReview: [],
  };
  const store = {
    listCollaborators: async () => [{ id: 'EMP-042', name: 'Vendedora' }],
    listDataset: async (input: unknown) => {
      calls.listDataset.push(input);
      return { collections: [], contacts: [], conversions: [] };
    },
    createCollection: async (input: unknown) => {
      calls.createCollection.push(input);
      return { collectionId, created: true, outcome: 'no_referral', contacts: [] };
    },
    listReconciliationContacts: async (input: unknown) => {
      calls.listReconciliationContacts.push(input);
      return [] as PostSaleContact[];
    },
    insertConversions: async (candidates: unknown, verifiedAt: unknown) => {
      calls.insertConversions.push({ candidates, verifiedAt });
      return Array.isArray(candidates) ? candidates.length : 0;
    },
    findConversionForReview: async () => ({ id: conversionId, ixcContractId: '000456', state: 'pending_review' }),
    findContactById: async () => validContact,
    confirmConversionReview: async (input: unknown) => {
      calls.confirmConversionReview.push(input);
      return true;
    },
    correctCollectionCollector: async () => ({ found: true, changed: true }),
    ...overrides,
  };
  return { store, calls };
}

function makeHandlers(overrides: Record<string, unknown> = {}) {
  const { store: storeOverrides, role = 'vendedor', ...dependencyOverrides } = overrides;
  let roleCalls: unknown[][] = [];
  const { store, calls } = makeStore(storeOverrides as Record<string, unknown> | undefined);
  const dependencies = {
    authenticate: async () => user,
    getRole: async (...args: unknown[]) => {
      roleCalls.push(args);
      return role;
    },
    resolveColaborador: async () => ({ id: 'EMP-042', name: 'Vendedora' }),
    createIxcGateway: async () => activeGateway,
    store,
    now: () => '2026-09-30T12:00:00.000Z',
    ...dependencyOverrides,
  };
  const handlers = createPostSaleHandlers(dependencies as never);
  return { handlers, calls, roleCalls: () => roleCalls };
}

function request(url: string, method = 'GET', body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('contrato exige sessão e papel resolvido sem metadata; não expõe credenciais IXC', async () => {
  const unauthenticated = makeHandlers({ authenticate: async () => null });
  const unauthorized = await unauthenticated.handlers.validateContract(request('/api/post-sale/contracts/validate', 'POST', { contractId: '0000042' }));
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(unauthenticated.roleCalls(), []);

  const authorized = makeHandlers();
  const response = await authorized.handlers.validateContract(request('/api/post-sale/contracts/validate', 'POST', { contractId: '0000042' }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(authorized.roleCalls(), [[user.id, user.email]]);
  assert.equal(payload.contract.contractId, '0000042');
  assert.equal(payload.contract.customerName, 'Cliente de origem');
  assert.equal(payload.contract.collectorColaboradorId, 'EMP-042');
  assert.equal(payload.contract.collectorName, 'Vendedora');
  assert.equal('phoneNumbers' in payload.contract, false);
  assert.equal('customerId' in payload.contract, false);
  assert.doesNotMatch(JSON.stringify(payload), /Authorization|Basic|token/i);
});

test('contrato inativo e indisponibilidade do IXC falham sem aceitar dados do navegador', async () => {
  const inactive = makeHandlers({
    createIxcGateway: async () => ({
      ...activeGateway,
      getContractsById: async (id: string) => [{ id, clientId: 'ixc-client-9', status: 'I', activatedAt: '2026-09-30' }],
    }),
  });
  const inactiveResponse = await inactive.handlers.validateContract(request('/api/post-sale/contracts/validate', 'POST', { contractId: '0000042' }));
  assert.equal(inactiveResponse.status, 422);

  const unavailable = makeHandlers({ createIxcGateway: async () => { throw new Error('IXC indisponível'); } });
  const unavailableResponse = await unavailable.handlers.validateContract(request('/api/post-sale/contracts/validate', 'POST', { contractId: '0000042' }));
  assert.equal(unavailableResponse.status, 503);
  assert.doesNotMatch(await unavailableResponse.text(), /token|telefone|payload/i);
});

test('registro no_referral usa colaborador da sessão e ignora ID adulterado do corpo', async () => {
  const harness = makeHandlers();
  const response = await harness.handlers.createCollection(request('/api/post-sale/collections', 'POST', {
    originContractId: '0000042',
    outcome: 'no_referral',
    contacts: [],
    collector_colaborador_id: 'EMP-999',
  }));
  const payload = await response.json();
  const saved = harness.calls.createCollection[0] as Record<string, unknown>;

  assert.equal(response.status, 201);
  assert.equal(payload.collectionId, collectionId);
  assert.equal(saved.collectorColaboradorId, 'EMP-042');
  assert.equal(saved.recordedBy, user.id);
  assert.equal(saved.originCustomerRef, 'Cliente de origem');
  assert.equal(saved.outcome, 'no_referral');
  assert.deepEqual(saved.contacts, []);
});

test('reenvio de coleta devolve conflito e falha de persistência não confirma sucesso', async () => {
  const duplicate = makeHandlers({
    store: { createCollection: async () => ({ collectionId, created: false, outcome: 'no_referral' }) },
  });
  const duplicateResponse = await duplicate.handlers.createCollection(request('/api/post-sale/collections', 'POST', {
    originContractId: '0000042', outcome: 'no_referral', contacts: [],
  }));
  assert.equal(duplicateResponse.status, 409);

  const failure = makeHandlers({ store: { createCollection: async () => { throw new Error('private database detail'); } } });
  const failedResponse = await failure.handlers.createCollection(request('/api/post-sale/collections', 'POST', {
    originContractId: '0000042', outcome: 'no_referral', contacts: [],
  }));
  assert.equal(failedResponse.status, 500);
  assert.doesNotMatch(await failedResponse.text(), /private database detail/);
});

test('vendedor só consulta a própria coleta e filtro de outro colaborador recebe 403', async () => {
  const harness = makeHandlers();
  const denied = await harness.handlers.getCollections(request('/api/post-sale/collections?collectorId=EMP-999'));
  assert.equal(denied.status, 403);
  assert.equal(harness.calls.listDataset.length, 0);

  const allowed = await harness.handlers.getCollections(request('/api/post-sale/collections?collectionId=foreign-collection'));
  const payload = await allowed.json();
  assert.equal(allowed.status, 200);
  assert.equal(harness.calls.listDataset.length, 1);
  assert.equal((harness.calls.listDataset[0] as Record<string, unknown>).collectorColaboradorId, 'EMP-042');
  assert.equal(payload.viewerRole, 'vendedor');
  assert.deepEqual(payload.viewerCollaborator, { id: 'EMP-042', name: 'Vendedora' });
  assert.deepEqual(payload.collaborators, [{ id: 'EMP-042', name: 'Vendedora' }]);
});

test('admin recebe lista da equipe sem o cliente enviar IDs arbitrários no corpo', async () => {
  const admin = makeHandlers({ role: 'admin' });
  const response = await admin.handlers.getCollections(request('/api/post-sale/collections'));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.viewerRole, 'admin');
  assert.deepEqual(payload.collaborators, [{ id: 'EMP-042', name: 'Vendedora' }]);
});

test('admin aplica coletor e períodos independentes ao relatório', async () => {
  const admin = makeHandlers({ role: 'admin' });
  const response = await admin.handlers.getCollections(request(
    '/api/post-sale/collections?collectorId=EMP-007&collectionStart=2026-08-01&collectionEnd=2026-08-31&conversionStart=2026-09-01&conversionEnd=2026-09-30',
  ));

  assert.equal(response.status, 200);
  assert.deepEqual(admin.calls.listDataset[0], {
    collectorColaboradorId: 'EMP-007',
    window: {
      collection: { start: '2026-08-01', end: '2026-08-31' },
      conversion: { start: '2026-09-01', end: '2026-09-30' },
    },
  });
});

test('reconciliação é restrita a admin e status Ganho sozinho não cria conversão', async () => {
  const denied = makeHandlers({ role: 'vendedor' });
  const deniedResponse = await denied.handlers.reconcile(request('/api/post-sale/reconcile', 'POST', {}));
  assert.equal(deniedResponse.status, 403);
  assert.equal(denied.calls.listReconciliationContacts.length, 0);

  const noIxcContract = makeHandlers({
    role: 'admin',
    store: { listReconciliationContacts: async () => [{ ...validContact, leadStatus: 'Ganho' }] },
    createIxcGateway: async () => ({
      ...activeGateway,
      listContractsByClientId: async () => [],
    }),
  });
  const response = await noIxcContract.handlers.reconcile(request('/api/post-sale/reconcile', 'POST', {}));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).inserted, 0);
  assert.equal(noIxcContract.calls.insertConversions.length, 0);
});

test('reconciliação grava candidatos idempotentes e devolve somente totais', async () => {
  const conversionCandidate = {
    contractId: '000456',
    activatedAt: '2026-09-11T12:30:00.000Z',
    collectionId,
    contactId,
    state: 'confirmed',
    reason: null,
  };
  const harness = makeHandlers({
    role: 'admin',
    store: {
      listReconciliationContacts: async () => [validContact],
      insertConversions: async (candidates: unknown, verifiedAt: string) => {
        harnessCalls.push({ candidates, verifiedAt });
        return 1;
      },
    },
    createIxcGateway: async () => ({
      ...activeGateway,
      listContractsByClientId: async () => [
        { id: '000456', clientId: 'ixc-client-10', status: 'A', activatedAt: '2026-09-11 09:30:00' },
      ],
      getContractsById: async (id: string) => id === '000456'
        ? [{ id, clientId: 'ixc-client-10', status: 'A', activatedAt: '2026-09-11 09:30:00' }]
        : [],
    }),
  });
  const harnessCalls: unknown[] = [];
  const response = await harness.handlers.reconcile(request('/api/post-sale/reconcile', 'POST', {}));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.inserted, 1);
  assert.equal(payload.confirmed, 1);
  assert.deepEqual(harnessCalls[0], {
    candidates: [conversionCandidate],
    verifiedAt: '2026-09-30T12:00:00.000Z',
  });
  assert.doesNotMatch(JSON.stringify(payload), /91987654321|Ana Lima|token/i);
});

test('revisão exige justificativa, contato elegível, papel admin e persiste revisor', async () => {
  const vendor = makeHandlers({ role: 'vendedor' });
  const denied = await vendor.handlers.reviewConversion(request('/api/post-sale/conversions/review', 'POST', {
    contactId, reason: 'Correspondência conferida no IXC.',
  }), conversionId);
  assert.equal(denied.status, 403);
  assert.equal(vendor.calls.confirmConversionReview.length, 0);

  const harness = makeHandlers({
    role: 'admin',
    store: {
      findConversionForReview: async () => ({ id: conversionId, ixcContractId: '000456', state: 'pending_review' }),
      findContactById: async () => validContact,
    },
  });
  const missingReason = await harness.handlers.reviewConversion(request('/api/post-sale/conversions/review', 'POST', {
    contactId, reason: '   ',
  }), conversionId);
  assert.equal(missingReason.status, 400);

  const saved = await harness.handlers.reviewConversion(request('/api/post-sale/conversions/review', 'POST', {
    contactId, reason: 'Telefone conferido com o cliente no IXC.',
  }), conversionId);
  assert.equal(saved.status, 200);
  assert.deepEqual(harness.calls.confirmConversionReview[0], {
    conversionId,
    contactId,
    collectionId,
    reviewedBy: user.id,
    reviewReason: 'Telefone conferido com o cliente no IXC.',
    reviewedAt: '2026-09-30T12:00:00.000Z',
  });
});

test('webhook sem contrato não cria conversões e rota Leads une ref com coleta própria sem user_metadata', () => {
  const webhook = readFileSync(new URL('../../app/api/integrations/ixc/webhook/route.ts', import.meta.url), 'utf8');
  const leadsRoute = readFileSync(new URL('../../app/api/leads/route.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(webhook, /post_sale_conversions/);
  assert.match(leadsRoute, /getUserRole\(user\.id,\s*user\.email\)/);
  assert.doesNotMatch(leadsRoute, /getUserRole\(user\.id,\s*user\.email,\s*\(user as any\)\.user_metadata/);
  assert.doesNotMatch(leadsRoute, /\.or\(/);
  assert.match(leadsRoute, /post_sale_collections/);
  assert.match(leadsRoute, /post_sale_collection_id/);
  assert.match(leadsRoute, /filterLegacyRefLeads\(data \|\| \[\]\)/);
});

test('lead post_sale com ref igual ao vendedor não vaza por busca de ref legado', () => {
  const legacyLead = { id: 101, source: 'indique-e-ganhe' };
  const otherSellersPostSaleLead = { id: 202, source: 'post_sale', post_sale_collection_id: 'collection-other' };

  assert.deepEqual(filterLegacyRefLeads([legacyLead, otherSellersPostSaleLead]), [legacyLead]);
});

test('relatório e reconciliação selecionam coletas pela data em que foram registradas', () => {
  const source = readFileSync(new URL('../../lib/post-sale/handlers.ts', import.meta.url), 'utf8');
  const listDataset = source.slice(source.indexOf('async listDataset(filter)'), source.indexOf('async createCollection(input)'));
  const listReconciliation = source.slice(source.indexOf('async listReconciliationContacts(collectionRange)'), source.indexOf('async insertConversions(candidates, verifiedAt)'));

  assert.match(listDataset, /\.gte\('created_at', collectionBounds\.start\)/);
  assert.match(listDataset, /\.lt\('created_at', collectionBounds\.endExclusive\)/);
  assert.doesNotMatch(listDataset, /\.gte\('sold_at', collectionBounds\.start\)/);
  assert.match(listReconciliation, /\.gte\('created_at', bounds\.start\)/);
  assert.match(listReconciliation, /\.lt\('created_at', bounds\.endExclusive\)/);
  assert.match(listReconciliation, /\.select\('id,sold_at,created_at'\)/);
});
