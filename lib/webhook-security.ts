import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const MAX_BODY_BYTES = 256 * 1024;
const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

export type SignedWebhook = {
  eventId: string;
  rawBody: string;
  payloadHash: string;
};

export async function readWebhookBody(request: NextRequest): Promise<string | null> {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return null;

  const rawBody = await request.text();
  return Buffer.byteLength(rawBody, 'utf8') <= MAX_BODY_BYTES ? rawBody : null;
}

export function verifySignedWebhook(
  request: NextRequest,
  rawBody: string,
  secret: string | undefined,
): SignedWebhook | null {
  if (!secret) return null;

  const signature = request.headers.get('x-webhook-signature')?.replace(/^sha256=/i, '').trim().toLowerCase();
  const timestamp = request.headers.get('x-webhook-timestamp')?.trim();
  const eventId = request.headers.get('x-webhook-id')?.trim();
  const timestampNumber = Number(timestamp);

  if (
    !signature ||
    !timestamp ||
    !eventId ||
    eventId.length > 160 ||
    !/^\d+$/.test(timestamp) ||
    !Number.isSafeInteger(timestampNumber) ||
    Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > MAX_TIMESTAMP_SKEW_SECONDS ||
    !/^[a-f0-9]{64}$/.test(signature)
  ) {
    return null;
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) return null;

  return {
    eventId,
    rawBody,
    payloadHash: createHash('sha256').update(rawBody).digest('hex'),
  };
}

/**
 * Compatibility for Power Automate flows created before HMAC signing was added.
 * Header authentication is preferred; the query-string form is retained only
 * so existing flows can be migrated without dropping submissions.
 */
export function verifyLegacyWebhook(
  request: NextRequest,
  rawBody: string,
  secret: string | undefined,
): SignedWebhook | null {
  if (!secret) return null;

  const providedSecret = request.headers.get('x-webhook-secret')?.trim()
    || request.nextUrl.searchParams.get('secret')?.trim();
  if (!providedSecret) return null;

  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(providedSecret);
  if (expectedBuffer.length !== providedBuffer.length) return null;
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  const payloadHash = createHash('sha256').update(rawBody).digest('hex');
  const suppliedEventId = request.headers.get('x-webhook-id')?.trim()
    || request.headers.get('x-ms-workflow-run-id')?.trim()
    || request.headers.get('x-ms-client-tracking-id')?.trim();
  const eventId = suppliedEventId && suppliedEventId.length <= 160
    ? `legacy-${suppliedEventId}`
    : `legacy-${payloadHash}`;

  return { eventId, rawBody, payloadHash };
}

export async function claimWebhookEvent(source: string, event: SignedWebhook) {
  const { error } = await supabaseAdmin.from('webhook_events').insert({
    source,
    event_id: event.eventId,
    payload_hash: event.payloadHash,
    status: 'processing',
  });

  if (!error) return { duplicate: false, conflict: false };
  if (error.code !== '23505') throw error;

  const { data: existing, error: readError } = await supabaseAdmin
    .from('webhook_events')
    .select('payload_hash')
    .eq('source', source)
    .eq('event_id', event.eventId)
    .maybeSingle();

  if (readError) throw readError;
  return {
    duplicate: existing?.payload_hash === event.payloadHash,
    conflict: existing?.payload_hash !== event.payloadHash,
  };
}

export async function completeWebhookEvent(source: string, eventId: string, status: 'completed' | 'failed') {
  await supabaseAdmin
    .from('webhook_events')
    .update({ status, processed_at: new Date().toISOString() })
    .eq('source', source)
    .eq('event_id', eventId);
}
