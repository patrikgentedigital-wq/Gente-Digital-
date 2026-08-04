import type { NextRequest } from 'next/server';

function normalizeOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isSameOriginRequest(request: NextRequest) {
  const allowedOrigins = new Set(
    [request.nextUrl.origin, process.env.APP_URL, process.env.NEXT_PUBLIC_SITE_URL]
      .map(normalizeOrigin)
      .filter((origin): origin is string => Boolean(origin)),
  );

  const origin = normalizeOrigin(request.headers.get('origin'));
  if (origin) return allowedOrigins.has(origin);

  const referer = request.headers.get('referer');
  if (referer) {
    const refererOrigin = normalizeOrigin(referer);
    return refererOrigin ? allowedOrigins.has(refererOrigin) : false;
  }

  return false;
}
