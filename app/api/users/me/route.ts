import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getUserRole } from '@/lib/auth-server';

// GET /api/users/me — retorna o role do usuário autenticado
export async function GET(req: NextRequest) {
  try {
    const rawUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const supabaseUrl = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
      ? rawUrl.replace(/\/+$/, '')
      : '';
    const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

    if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Serviço de autenticação não configurado.' }, { status: 503 });
      }
      return NextResponse.json({ role: 'admin' }); // dev local
    }

    // Cookies renovados pelo Supabase (refresh de token) são capturados e aplicados
    // na resposta final (padrão @supabase/ssr para App Router)
    let cookiesToSet: Array<{ name: string; value: string; options?: any }> = [];

    const client = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(set) { cookiesToSet = set; },
      },
    });

    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const role = await getUserRole(user.id, user.email, (user as any).user_metadata);

    const response = NextResponse.json({
      id: user.id,
      email: user.email,
      role: role ?? 'vendedor',
    });

    for (const { name, value, options } of cookiesToSet) {
      response.cookies.set(name, value, options);
    }

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
