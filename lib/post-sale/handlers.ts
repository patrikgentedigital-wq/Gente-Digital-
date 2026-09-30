import 'server-only';
import { z } from 'zod';
import { getAuthenticatedUser, getUserRole } from '@/lib/auth-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  buildPostSaleMetrics,
  parseIxcDate,
} from './metrics';
import {
  createIxcGateway,
  reconcileContractsForContacts,
  validateOriginContract,
} from './ixc';
import { duplicatePhoneIndexes } from './phones';
import {
  PostSaleDomainError,
  type ConversionCandidate,
  type IxcGateway,
  type PostSaleCollectionMetricRow,
  type PostSaleContact,
  type PostSaleContactDraft,
  type PostSaleCollaborator,
  type PostSaleDataset,
  type PostSaleDateRange,
  type PostSaleMetricConversion,
  type PostSaleOutcome,
  type PostSaleWindow,
} from './contracts';

const COLLECTION_STATES = ['contacts_collected', 'no_referral'] as const;
const CONTACT_STATES = ['created_lead', 'duplicate_existing', 'invalid'] as const;
const CONVERSION_STATES = ['confirmed', 'pending_review'] as const;
const PAGE_SIZE = 1000;
const MAX_ROWS = 50_000;
const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

export interface PostSaleUser {
  id: string;
  email?: string | null;
}

export interface CreatePostSaleCollectionInput {
  originContractId: string;
  originCustomerRef: string;
  soldAt: string;
  collectorColaboradorId: string;
  recordedBy: string;
  outcome: PostSaleOutcome;
  contacts: PostSaleContactDraft[];
}

export interface PostSaleCollectionCreateResult {
  collectionId: string;
  created: boolean;
  outcome: PostSaleOutcome;
  contacts?: unknown[];
}

export interface PostSaleDashboardFilter {
  window: PostSaleWindow;
  collectorColaboradorId: string | null;
}

export interface PostSaleStore {
  listCollaborators(): Promise<PostSaleCollaborator[]>;
  listDataset(filter: PostSaleDashboardFilter): Promise<PostSaleDataset>;
  createCollection(input: CreatePostSaleCollectionInput): Promise<PostSaleCollectionCreateResult>;
  listReconciliationContacts(collectionRange: PostSaleDateRange): Promise<PostSaleContact[]>;
  insertConversions(candidates: ConversionCandidate[], verifiedAt: string): Promise<number>;
  findConversionForReview(id: string): Promise<{ id: string; state: string } | null>;
  findContactById(id: string): Promise<PostSaleContact | null>;
  confirmConversionReview(input: {
    conversionId: string;
    contactId: string;
    collectionId: string;
    reviewedBy: string;
    reviewReason: string;
    reviewedAt: string;
  }): Promise<boolean>;
  correctCollectionCollector(input: {
    collectionId: string;
    collectorColaboradorId: string;
    changedBy: string;
    reason: string;
    changedAt: string;
  }): Promise<{ found: boolean; changed: boolean }>;
}

export interface PostSaleHandlerDependencies {
  authenticate(request: Request): Promise<PostSaleUser | null>;
  getRole(userId: string, email?: string | null): Promise<'admin' | 'vendedor'>;
  resolveColaborador(user: PostSaleUser): Promise<PostSaleCollaborator | null>;
  createIxcGateway(): Promise<IxcGateway>;
  store: PostSaleStore;
  now(): string;
}

const contactDraftSchema = z.object({
  name: z.string().max(160),
  phone: z.string().max(64),
});

const collectionSchema = z.object({
  originContractId: z.string().trim().min(1).max(100),
  outcome: z.enum(COLLECTION_STATES),
  contacts: z.array(contactDraftSchema).max(100),
}).superRefine((value, context) => {
  if (value.outcome === 'no_referral' && value.contacts.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Uma coleta sem contatos não pode incluir contatos.', path: ['contacts'] });
  }
  if (value.outcome === 'contacts_collected' && value.contacts.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Inclua ao menos um contato ou selecione sem contatos.', path: ['contacts'] });
  }
  if (duplicatePhoneIndexes(value.contacts.map((contact) => contact.phone)).length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Há telefones repetidos nesta coleta.', path: ['contacts'] });
  }
});

const reconciliationSchema = z.object({
  collectionStart: z.string().optional(),
  collectionEnd: z.string().optional(),
});

const reviewSchema = z.object({
  contactId: z.string().uuid(),
  reason: z.string().trim().min(10).max(500),
});
const collectorCorrectionSchema = z.object({
  collectorColaboradorId: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(10).max(500),
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function formatBusinessDate(input: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(input));
  const part = (type: string) => parts.find((value) => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function currentMonthRange(now: string): PostSaleDateRange {
  const today = formatBusinessDate(now);
  return { start: `${today.slice(0, 7)}-01`, end: today };
}

function parseRange(start: unknown, end: unknown, fallback: PostSaleDateRange): PostSaleDateRange {
  const startValue = start ?? fallback.start;
  const endValue = end ?? fallback.end;
  if (!isDateOnly(startValue) || !isDateOnly(endValue) || startValue > endValue) {
    throw new RangeError('Período inválido.');
  }
  return { start: startValue, end: endValue };
}

function parseDashboardWindow(url: URL, now: string): PostSaleWindow {
  const fallback = currentMonthRange(now);
  return {
    collection: parseRange(url.searchParams.get('collectionStart') ?? undefined, url.searchParams.get('collectionEnd') ?? undefined, fallback),
    conversion: parseRange(url.searchParams.get('conversionStart') ?? undefined, url.searchParams.get('conversionEnd') ?? undefined, fallback),
  };
}

function parseErrorResponse(error: unknown): Response {
  if (error instanceof PostSaleDomainError) {
    return json({ success: false, error: error.message, code: error.code }, error.code === 'ixc_unavailable' ? 503 : 422);
  }
  if (error instanceof RangeError) {
    return json({ success: false, error: error.message }, 400);
  }
  return json({ success: false, error: 'Não foi possível concluir a operação de pós-venda.' }, 500);
}

async function pagination<T>(buildQuery: (from: number, to: number) => any): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await buildQuery(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error('Consulta de pós-venda indisponível.');
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
  throw new Error('O conjunto de pós-venda excede o limite seguro da consulta.');
}

function nextBusinessDay(value: string): string {
  const day = new Date(`${value}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

function timestampRange(range: PostSaleDateRange): { start: string; endExclusive: string } {
  return {
    start: new Date(`${range.start}T00:00:00-03:00`).toISOString(),
    endExclusive: new Date(`${nextBusinessDay(range.end)}T00:00:00-03:00`).toISOString(),
  };
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

function numberId(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function collectionFromRow(row: Record<string, unknown>): PostSaleCollectionMetricRow {
  return {
    id: stringValue(row.id),
    originContractId: stringValue(row.origin_contract_id),
    soldAt: stringValue(row.sold_at),
    collectorColaboradorId: stringValue(row.collector_colaborador_id),
    outcome: stringValue(row.outcome) as PostSaleOutcome,
    originCustomerRef: stringValue(row.origin_customer_ref),
    createdAt: stringValue(row.created_at),
  };
}

function contactFromRow(
  row: Record<string, unknown>,
  leadById: Map<number, Record<string, unknown>> = new Map(),
  firstAttendanceByLead: Map<number, string> = new Map(),
): PostSaleContact {
  const leadId = numberId(row.lead_id);
  const lead = leadId === null ? undefined : leadById.get(leadId);
  return {
    id: stringValue(row.id),
    collectionId: stringValue(row.post_sale_collection_id),
    name: stringValue(row.contact_name),
    phoneRaw: stringValue(row.phone_raw),
    phoneNormalized: stringValue(row.phone_normalized),
    state: stringValue(row.state) as PostSaleContact['state'],
    reason: row.reason === null || row.reason === undefined ? null : stringValue(row.reason),
    leadId,
    createdAt: stringValue(row.created_at),
    leadStatus: lead ? stringValue(lead.status) : null,
    firstAttendanceAt: leadId === null ? null : firstAttendanceByLead.get(leadId) ?? null,
  };
}

function conversionFromRow(row: Record<string, unknown>): PostSaleMetricConversion {
  return {
    id: stringValue(row.id),
    ixcContractId: stringValue(row.ixc_contract_id),
    collectionId: row.post_sale_collection_id === null || row.post_sale_collection_id === undefined ? null : stringValue(row.post_sale_collection_id),
    contactId: row.post_sale_contact_id === null || row.post_sale_contact_id === undefined ? null : stringValue(row.post_sale_contact_id),
    activatedAt: stringValue(row.activated_at),
    verifiedAt: stringValue(row.verified_at),
    state: stringValue(row.state) as PostSaleMetricConversion['state'],
  };
}

function createSupabaseStore(): PostSaleStore {
  async function rowsByIds<T>(table: string, selection: string, column: string, ids: Array<string | number>, orderColumn?: string): Promise<T[]> {
    const results: T[] = [];
    for (const idChunk of chunks(ids, 250)) {
      const rows = await pagination<T>((from, to) => {
        let query = supabaseAdmin.from(table).select(selection).in(column, idChunk);
        if (orderColumn) query = query.order(orderColumn, { ascending: true });
        return query.range(from, to);
      });
      results.push(...rows);
    }
    return results;
  }

  async function conversionRows(range: PostSaleDateRange, ownedCollectionIds?: string[]): Promise<Record<string, unknown>[]> {
    const bounds = timestampRange(range);
    if (ownedCollectionIds && ownedCollectionIds.length === 0) return [];
    if (ownedCollectionIds) {
      const results: Record<string, unknown>[] = [];
      for (const idChunk of chunks(ownedCollectionIds, 250)) {
        results.push(...await pagination<Record<string, unknown>>((from, to) => (
          supabaseAdmin
            .from('post_sale_conversions')
            .select('id,ixc_contract_id,post_sale_collection_id,post_sale_contact_id,activated_at,verified_at,state')
            .in('post_sale_collection_id', idChunk)
            .gte('activated_at', bounds.start)
            .lt('activated_at', bounds.endExclusive)
            .order('activated_at', { ascending: false })
            .range(from, to)
        )));
      }
      return results;
    }

    return pagination<Record<string, unknown>>((from, to) => (
      supabaseAdmin
        .from('post_sale_conversions')
        .select('id,ixc_contract_id,post_sale_collection_id,post_sale_contact_id,activated_at,verified_at,state')
        .gte('activated_at', bounds.start)
        .lt('activated_at', bounds.endExclusive)
        .order('activated_at', { ascending: false })
        .range(from, to)
    ));
  }

  return {
    async listCollaborators() {
      return pagination<Record<string, unknown>>((from, to) => (
        supabaseAdmin
          .from('colaboradores')
          .select('id,name')
          .order('name', { ascending: true })
          .range(from, to)
      )).then((rows) => rows.map((row) => ({
        id: stringValue(row.id),
        name: stringValue(row.name),
      })).filter((collaborator) => collaborator.id));
    },

    async listDataset(filter) {
      const collectionBounds = timestampRange(filter.window.collection);
      const collectionRows = await pagination<Record<string, unknown>>((from, to) => {
        let query = supabaseAdmin
          .from('post_sale_collections')
          .select('id,origin_contract_id,origin_customer_ref,sold_at,collector_colaborador_id,outcome,created_at')
          .gte('created_at', collectionBounds.start)
          .lt('created_at', collectionBounds.endExclusive)
          .order('created_at', { ascending: false })
          .range(from, to);
        if (filter.collectorColaboradorId) {
          query = query.eq('collector_colaborador_id', filter.collectorColaboradorId);
        }
        return query;
      });

      let ownedCollectionIds: string[] | undefined;
      if (filter.collectorColaboradorId) {
        const ownedRows = await pagination<Record<string, unknown>>((from, to) => (
          supabaseAdmin
            .from('post_sale_collections')
            .select('id')
            .eq('collector_colaborador_id', filter.collectorColaboradorId)
            .order('id', { ascending: true })
            .range(from, to)
        ));
        ownedCollectionIds = ownedRows.map((row) => stringValue(row.id)).filter(Boolean);
      }

      const collectionIds = collectionRows.map((row) => stringValue(row.id)).filter(Boolean);
      const contactRows = collectionIds.length === 0
        ? []
        : await rowsByIds<Record<string, unknown>>(
          'post_sale_contacts',
          'id,post_sale_collection_id,contact_name,phone_raw,phone_normalized,state,reason,lead_id,created_at',
          'post_sale_collection_id',
          collectionIds,
          'created_at',
        );
      const leadIds = Array.from(new Set(contactRows.map((row) => numberId(row.lead_id)).filter((id): id is number => id !== null)));
      const leadRows = leadIds.length === 0
        ? []
        : await rowsByIds<Record<string, unknown>>('leads', 'id,status', 'id', leadIds);
      const leadById = new Map(leadRows.flatMap((row) => {
        const id = numberId(row.id);
        return id === null ? [] : [[id, row] as const];
      }));

      const historyRows = leadIds.length === 0
        ? []
        : await rowsByIds<Record<string, unknown>>('lead_history', 'lead_id,action,created_at', 'lead_id', leadIds, 'created_at');
      const firstAttendanceByLead = new Map<number, string>();
      for (const history of historyRows) {
        const leadId = numberId(history.lead_id);
        const action = stringValue(history.action).trim().toLocaleLowerCase('pt-BR');
        const createdAt = stringValue(history.created_at);
        if (leadId !== null && action === 'nota registrada' && parseIxcDate(createdAt) && !firstAttendanceByLead.has(leadId)) {
          firstAttendanceByLead.set(leadId, createdAt);
        }
      }

      const conversionRangeRows = await conversionRows(filter.window.conversion, ownedCollectionIds);
      return {
        collections: collectionRows.map(collectionFromRow),
        contacts: contactRows.map((row) => contactFromRow(row, leadById, firstAttendanceByLead)),
        conversions: conversionRangeRows.map(conversionFromRow),
      };
    },

    async createCollection(input) {
      const { data, error } = await supabaseAdmin.rpc('create_post_sale_collection_with_contacts', {
        p_origin_contract_id: input.originContractId,
        p_origin_customer_ref: input.originCustomerRef,
        p_sold_at: input.soldAt,
        p_collector_colaborador_id: input.collectorColaboradorId,
        p_recorded_by: input.recordedBy,
        p_outcome: input.outcome,
        p_contacts: input.contacts,
      });
      if (error) throw new Error('A gravação da coleta não foi concluída.');
      const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
      if (!result || typeof result.collectionId !== 'string' || typeof result.created !== 'boolean') {
        throw new Error('A gravação da coleta retornou um resultado inválido.');
      }
      return {
        collectionId: result.collectionId,
        created: result.created,
        outcome: stringValue(result.outcome) as PostSaleOutcome,
        contacts: Array.isArray(result.contacts) ? result.contacts : [],
      };
    },

    async listReconciliationContacts(collectionRange) {
      const bounds = timestampRange(collectionRange);
      const collectionRows = await pagination<Record<string, unknown>>((from, to) => (
        supabaseAdmin
          .from('post_sale_collections')
          .select('id,sold_at,created_at')
          .gte('created_at', bounds.start)
          .lt('created_at', bounds.endExclusive)
          .order('created_at', { ascending: false })
          .range(from, to)
      ));
      const collectionIds = collectionRows.map((row) => stringValue(row.id)).filter(Boolean);
      if (collectionIds.length === 0) return [];
      const originSoldAtByCollection = new Map(collectionRows.map((row) => [
        stringValue(row.id),
        stringValue(row.sold_at),
      ]));
      const contactRows = await rowsByIds<Record<string, unknown>>(
        'post_sale_contacts',
        'id,post_sale_collection_id,contact_name,phone_raw,phone_normalized,state,reason,lead_id,created_at',
        'post_sale_collection_id',
        collectionIds,
        'created_at',
      );
      return contactRows
        .map((row) => {
          const contact = contactFromRow(row);
          return { ...contact, originSoldAt: originSoldAtByCollection.get(contact.collectionId) };
        })
        .filter((contact) => contact.state === 'created_lead' && contact.leadId !== null);
    },

    async insertConversions(candidates, verifiedAt) {
      if (candidates.length === 0) return 0;
      const rows = candidates.map((candidate) => ({
        ixc_contract_id: candidate.contractId,
        post_sale_collection_id: candidate.collectionId,
        post_sale_contact_id: candidate.contactId,
        activated_at: candidate.activatedAt,
        verified_at: verifiedAt,
        state: candidate.state,
      }));
      const { data, error } = await supabaseAdmin
        .from('post_sale_conversions')
        .upsert(rows, { onConflict: 'ixc_contract_id', ignoreDuplicates: true })
        .select('id');
      if (error) throw new Error('A reconciliação não foi salva.');
      return data?.length ?? 0;
    },

    async findConversionForReview(id) {
      const { data, error } = await supabaseAdmin
        .from('post_sale_conversions')
        .select('id,state')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error('Não foi possível localizar a revisão.');
      return data ? { id: stringValue(data.id), state: stringValue(data.state) } : null;
    },

    async findContactById(id) {
      const { data, error } = await supabaseAdmin
        .from('post_sale_contacts')
        .select('id,post_sale_collection_id,contact_name,phone_raw,phone_normalized,state,reason,lead_id,created_at')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error('Não foi possível localizar o contato.');
      return data ? contactFromRow(data) : null;
    },

    async confirmConversionReview(input) {
      const { data, error } = await supabaseAdmin
        .from('post_sale_conversions')
        .update({
          post_sale_collection_id: input.collectionId,
          post_sale_contact_id: input.contactId,
          state: 'confirmed',
          reviewed_by: input.reviewedBy,
          review_reason: input.reviewReason,
          reviewed_at: input.reviewedAt,
          updated_at: input.reviewedAt,
        })
        .eq('id', input.conversionId)
        .eq('state', 'pending_review')
        .select('id')
        .maybeSingle();
      if (error) throw new Error('A revisão não foi salva.');
      return !!data;
    },

    async correctCollectionCollector(input) {
      const { data, error } = await supabaseAdmin.rpc('correct_post_sale_collection_collector', {
        p_collection_id: input.collectionId,
        p_new_colaborador_id: input.collectorColaboradorId,
        p_changed_by: input.changedBy,
        p_reason: input.reason,
        p_changed_at: input.changedAt,
      });
      if (error) throw new Error('A correção de coletor não foi salva.');
      const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
      if (!result || typeof result.found !== 'boolean' || typeof result.changed !== 'boolean') {
        throw new Error('A correção de coletor retornou um resultado inválido.');
      }
      return { found: result.found, changed: result.changed };
    },
  };
}

export function createPostSaleHandlers(dependencies: PostSaleHandlerDependencies) {
  async function getIxcGateway(): Promise<IxcGateway> {
    try {
      return await dependencies.createIxcGateway();
    } catch {
      throw new PostSaleDomainError('ixc_unavailable', 'Não foi possível conectar ao IXC agora.');
    }
  }

  async function identify(request: Request): Promise<{ user: PostSaleUser; role: 'admin' | 'vendedor' } | Response> {
    let user: PostSaleUser | null;
    try {
      user = await dependencies.authenticate(request);
    } catch {
      return json({ success: false, error: 'A autenticação está indisponível.' }, 503);
    }
    if (!user) return json({ success: false, error: 'Não autorizado.' }, 401);

    try {
      // Deliberadamente recebe só ID e e-mail; user_metadata nunca concede papel.
      const role = await dependencies.getRole(user.id, user.email ?? null);
      return { user, role: role === 'admin' ? 'admin' : 'vendedor' };
    } catch {
      return json({ success: false, error: 'Não foi possível verificar o acesso.' }, 503);
    }
  }

  async function validateContract(request: Request): Promise<Response> {
    const access = await identify(request);
    if (access instanceof Response) return access;
    const parsed = z.object({ contractId: z.string().trim().min(1).max(100) }).safeParse(await readJson(request));
    if (!parsed.success) return json({ success: false, error: 'Informe um ID de contrato válido.' }, 400);

    try {
      let collaborator: PostSaleCollaborator | null;
      try {
        collaborator = await dependencies.resolveColaborador(access.user);
      } catch {
        return json({ success: false, error: 'Não foi possível resolver o vínculo do colaborador.' }, 503);
      }
      if (!collaborator) return json({ success: false, error: 'Colaborador não vinculado à sessão.' }, 403);
      const ixc = await getIxcGateway();
      const verified = await validateOriginContract(parsed.data.contractId, ixc);
      return json({
        success: true,
        contract: {
          contractId: verified.contractId,
          customerName: verified.customerName,
          soldAt: verified.soldAt,
          collectorColaboradorId: collaborator.id,
          collectorName: collaborator.name,
        },
      });
    } catch (error) {
      return parseErrorResponse(error);
    }
  }

  async function getCollections(request: Request): Promise<Response> {
    const access = await identify(request);
    if (access instanceof Response) return access;

    let collaborator: PostSaleCollaborator | null = null;
    if (access.role !== 'admin') {
      try {
        collaborator = await dependencies.resolveColaborador(access.user);
      } catch {
        return json({ success: false, error: 'Não foi possível resolver o vínculo do colaborador.' }, 503);
      }
      if (!collaborator) return json({ success: false, error: 'Colaborador não vinculado à sessão.' }, 403);
    } else {
      try {
        collaborator = await dependencies.resolveColaborador(access.user);
      } catch {
        collaborator = null;
      }
    }

    const url = new URL(request.url);
    const requestedCollector = url.searchParams.get('collectorId');
    if (access.role !== 'admin' && requestedCollector && requestedCollector !== collaborator?.id) {
      return json({ success: false, error: 'Acesso negado ao escopo solicitado.' }, 403);
    }

    let window: PostSaleWindow;
    try {
      window = parseDashboardWindow(url, dependencies.now());
    } catch (error) {
      return parseErrorResponse(error);
    }

    const collectorColaboradorId = access.role === 'admin'
      ? requestedCollector || null
      : collaborator?.id ?? null;
    try {
      const [dataset, collaborators] = await Promise.all([
        dependencies.store.listDataset({ window, collectorColaboradorId }),
        access.role === 'admin'
          ? dependencies.store.listCollaborators()
          : Promise.resolve(collaborator ? [collaborator] : []),
      ]);
      return json({
        success: true,
        basisLabel: 'vendas de origem registradas no painel',
        metrics: buildPostSaleMetrics(dataset, window),
        collections: dataset.collections,
        contacts: dataset.contacts,
        conversions: dataset.conversions,
        collaborators,
        viewerRole: access.role,
        viewerCollaborator: collaborator,
      });
    } catch {
      return json({ success: false, error: 'Não foi possível carregar o relatório de pós-venda.' }, 500);
    }
  }

  async function createCollection(request: Request): Promise<Response> {
    const access = await identify(request);
    if (access instanceof Response) return access;

    let collaborator: PostSaleCollaborator | null;
    try {
      collaborator = await dependencies.resolveColaborador(access.user);
    } catch {
      return json({ success: false, error: 'Não foi possível resolver o vínculo do colaborador.' }, 503);
    }
    if (!collaborator) return json({ success: false, error: 'Colaborador não vinculado à sessão.' }, 403);

    const parsed = collectionSchema.safeParse(await readJson(request));
    if (!parsed.success) return json({ success: false, error: parsed.error.issues[0]?.message ?? 'Dados da coleta inválidos.' }, 400);

    try {
      const ixc = await getIxcGateway();
      const origin = await validateOriginContract(parsed.data.originContractId, ixc);
      const saved = await dependencies.store.createCollection({
        originContractId: origin.contractId,
        originCustomerRef: origin.customerName,
        soldAt: origin.soldAt,
        collectorColaboradorId: collaborator.id,
        recordedBy: access.user.id,
        outcome: parsed.data.outcome,
        contacts: parsed.data.contacts,
      });
      if (!saved.created) {
        return json({ success: false, error: 'Este contrato de origem já possui uma coleta registrada.', collectionId: saved.collectionId }, 409);
      }
      return json({ success: true, ...saved, collector: collaborator }, 201);
    } catch (error) {
      return parseErrorResponse(error);
    }
  }

  async function reconcile(request: Request): Promise<Response> {
    const access = await identify(request);
    if (access instanceof Response) return access;
    if (access.role !== 'admin') return json({ success: false, error: 'Somente administradores podem reconciliar contratos.' }, 403);

    const body = reconciliationSchema.safeParse((await readJson(request)) ?? {});
    if (!body.success) return json({ success: false, error: 'Período de reconciliação inválido.' }, 400);
    let collectionRange: PostSaleDateRange;
    try {
      collectionRange = parseRange(body.data.collectionStart, body.data.collectionEnd, currentMonthRange(dependencies.now()));
    } catch (error) {
      return parseErrorResponse(error);
    }

    try {
      const contacts = await dependencies.store.listReconciliationContacts(collectionRange);
      if (contacts.length === 0) {
        return json({ success: true, scannedContacts: 0, inserted: 0, confirmed: 0, pendingReview: 0 });
      }
      const ixc = await getIxcGateway();
      const candidates = await reconcileContractsForContacts(contacts, ixc);
      const inserted = candidates.length === 0
        ? 0
        : await dependencies.store.insertConversions(candidates, dependencies.now());
      return json({
        success: true,
        scannedContacts: contacts.length,
        candidates: candidates.length,
        inserted,
        confirmed: candidates.filter((candidate) => candidate.state === 'confirmed').length,
        pendingReview: candidates.filter((candidate) => candidate.state === 'pending_review').length,
      });
    } catch (error) {
      return parseErrorResponse(error);
    }
  }

  async function reviewConversion(request: Request, id: string): Promise<Response> {
    const access = await identify(request);
    if (access instanceof Response) return access;
    if (access.role !== 'admin') return json({ success: false, error: 'Somente administradores podem revisar conversões.' }, 403);
    if (!z.string().uuid().safeParse(id).success) return json({ success: false, error: 'Identificador de revisão inválido.' }, 400);

    const parsed = reviewSchema.safeParse(await readJson(request));
    if (!parsed.success) return json({ success: false, error: 'Informe um contato válido e uma justificativa de pelo menos 10 caracteres.' }, 400);

    try {
      const conversion = await dependencies.store.findConversionForReview(id);
      if (!conversion) return json({ success: false, error: 'Revisão não encontrada.' }, 404);
      if (conversion.state !== 'pending_review') return json({ success: false, error: 'Esta conversão não está pendente de revisão.' }, 409);

      const contact = await dependencies.store.findContactById(parsed.data.contactId);
      if (!contact || contact.state !== 'created_lead' || contact.leadId === null) {
        return json({ success: false, error: 'Escolha um contato elegível da coleta.' }, 400);
      }

      const reviewedAt = dependencies.now();
      const saved = await dependencies.store.confirmConversionReview({
        conversionId: id,
        contactId: contact.id,
        collectionId: contact.collectionId,
        reviewedBy: access.user.id,
        reviewReason: parsed.data.reason,
        reviewedAt,
      });
      if (!saved) return json({ success: false, error: 'A revisão mudou; atualize a tela e tente novamente.' }, 409);
      return json({ success: true, conversionId: id, contactId: contact.id, state: 'confirmed' });
    } catch {
      return json({ success: false, error: 'Não foi possível salvar a revisão.' }, 500);
    }
  }

  async function correctCollectionCollector(request: Request, id: string): Promise<Response> {
    const access = await identify(request);
    if (access instanceof Response) return access;
    if (access.role !== 'admin') return json({ success: false, error: 'Somente administradores podem corrigir atribuições.' }, 403);
    if (!z.string().uuid().safeParse(id).success) return json({ success: false, error: 'Identificador de coleta inválido.' }, 400);

    const parsed = collectorCorrectionSchema.safeParse(await readJson(request));
    if (!parsed.success) return json({ success: false, error: 'Informe um colaborador e uma justificativa de pelo menos 10 caracteres.' }, 400);

    try {
      const result = await dependencies.store.correctCollectionCollector({
        collectionId: id,
        collectorColaboradorId: parsed.data.collectorColaboradorId,
        changedBy: access.user.id,
        reason: parsed.data.reason,
        changedAt: dependencies.now(),
      });
      if (!result.found) return json({ success: false, error: 'Coleta não encontrada.' }, 404);
      return json({ success: true, changed: result.changed });
    } catch {
      return json({ success: false, error: 'Não foi possível corrigir a atribuição.' }, 500);
    }
  }

  return { validateContract, getCollections, createCollection, reconcile, reviewConversion, correctCollectionCollector };
}

const defaultHandlers = createPostSaleHandlers({
  authenticate: (request) => getAuthenticatedUser(request as import('next/server').NextRequest),
  getRole: async (userId, email) => (await getUserRole(userId, email)) === 'admin' ? 'admin' : 'vendedor',
  async resolveColaborador(user) {
    const byUserId = await supabaseAdmin
      .from('colaboradores')
      .select('id,name')
      .eq('user_id', user.id)
      .maybeSingle();
    if (byUserId.error) throw new Error('Colaborador indisponível.');
    if (byUserId.data) return { id: stringValue(byUserId.data.id), name: stringValue(byUserId.data.name) };

    const email = (user.email ?? '').trim().toLowerCase();
    if (!email) return null;
    const byEmail = await supabaseAdmin
      .from('colaboradores')
      .select('id,name')
      .eq('email', email)
      .maybeSingle();
    if (byEmail.error) throw new Error('Colaborador indisponível.');
    return byEmail.data
      ? { id: stringValue(byEmail.data.id), name: stringValue(byEmail.data.name) }
      : null;
  },
  createIxcGateway,
  store: createSupabaseStore(),
  now: () => new Date().toISOString(),
});

export const postSaleHandlers = defaultHandlers;
