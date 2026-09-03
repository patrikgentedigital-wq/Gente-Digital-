import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // 1. Request ID Único (DevOps Rule 1)
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  // Garantir que a resposta HTTP sempre retorne o header x-request-id
  supabaseResponse.headers.set('x-request-id', requestId);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

  // Rotas públicas não precisam consultar a sessão antes de renderizar.
  // Isso mantém a landing de indicação rápida e permite que o fluxo funcione
  // mesmo quando o Supabase ainda não foi configurado no ambiente local.
  // Rotas públicas que não exigem autenticação prévia
  const isLoginRoute = request.nextUrl.pathname.startsWith('/login')
  const isPasswordResetRoute = request.nextUrl.pathname.startsWith('/redefinir-senha')
  const isAuthRoute = isLoginRoute || isPasswordResetRoute
  const isPublicLanding = request.nextUrl.pathname.startsWith('/indicar')
  const isPublicApi = 
    request.nextUrl.pathname.startsWith('/api/referrals') ||
    request.nextUrl.pathname.startsWith('/api/track-click') ||
    (request.nextUrl.pathname === '/api/settings/base-link' && request.method === 'GET')
  const isWebhookRoute = 
    request.nextUrl.pathname.startsWith('/api/webhooks') ||
    request.nextUrl.pathname.startsWith('/api/integrations/ixc/webhook')
  const isHealthRoute = request.nextUrl.pathname.startsWith('/api/health')
  const isMetricsRoute = request.nextUrl.pathname.startsWith('/api/metrics')

  const isPublicRoute = isPublicLanding || isPublicApi || isWebhookRoute || isHealthRoute || isMetricsRoute

  if (isPublicRoute) {
    return supabaseResponse;
  }

  // Se não estiver configurado corretamente, não travar o build, mas bloquear em produção
  if (supabaseUrl.includes('placeholder')) {
    if (process.env.NODE_ENV === 'production') {
      if (isAuthRoute) return supabaseResponse;
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

  // Proteção CSRF: validação de Origin em rotas de API com mutação de estado (POST, PATCH, DELETE, PUT)
  const isMutation = ['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method);
  if (isMutation && request.nextUrl.pathname.startsWith('/api')) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          const forbiddenRes = NextResponse.json(
            { error: 'Acesso negado: Origem não autorizada (CSRF Protection).' },
            { status: 403 }
          );
          forbiddenRes.headers.set('x-request-id', requestId);
          return forbiddenRes;
        }
      } catch {
        const forbiddenRes = NextResponse.json(
          { error: 'Acesso negado: Origem inválida.' },
          { status: 403 }
        );
        forbiddenRes.headers.set('x-request-id', requestId);
        return forbiddenRes;
      }
    }
  }

  // Proteger rotas da aplicação e APIs restantes.
  // Permite acesso a /login e /redefinir-senha para usuários não autenticados.
  if (!user && !isAuthRoute && !isPublicRoute) {
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

  // Se o usuário estiver autenticado e tentar acessar /login, redireciona para o painel /
  // Mas permite acessar /redefinir-senha caso queira atualizar suas credenciais
  if (user && isLoginRoute) {
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
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
