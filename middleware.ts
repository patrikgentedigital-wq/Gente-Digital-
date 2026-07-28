import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // 1. Request ID Único (DevOps Rule 1)
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  request.headers.set('x-request-id', requestId);

  let supabaseResponse = NextResponse.next({
    request,
  })

  // Garantir que a resposta HTTP sempre retorne o header x-request-id
  supabaseResponse.headers.set('x-request-id', requestId);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

  // Se não estiver configurado corretamente, não travar o build, mas bloquear em produção
  if (supabaseUrl.includes('placeholder')) {
    if (process.env.NODE_ENV === 'production') {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      const redirectRes = NextResponse.redirect(url);
      redirectRes.headers.set('x-request-id', requestId);
      return redirectRes;
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          supabaseResponse.headers.set('x-request-id', requestId);
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protect all routes except /login, /api/webhooks, /api/health e /api/metrics
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login')
  const isWebhookRoute = request.nextUrl.pathname.startsWith('/api/webhooks')
  const isHealthRoute = request.nextUrl.pathname.startsWith('/api/health')
  const isMetricsRoute = request.nextUrl.pathname.startsWith('/api/metrics')
  
  if (!user && !isAuthRoute && !isWebhookRoute && !isHealthRoute && !isMetricsRoute) {
    if (request.nextUrl.pathname.startsWith('/api')) {
      const unauthRes = NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
      unauthRes.headers.set('x-request-id', requestId);
      return unauthRes;
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const redirectRes = NextResponse.redirect(url);
    redirectRes.headers.set('x-request-id', requestId);
    return redirectRes;
  }

  // If user is logged in and tries to access /login, redirect to /
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    const redirectRes = NextResponse.redirect(url);
    redirectRes.headers.set('x-request-id', requestId);
    return redirectRes;
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
