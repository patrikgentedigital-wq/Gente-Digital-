import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getUserRole } from '@/lib/auth-server';

// GET /api/users/me — retorna o role do usuário autenticado
export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
      return NextResponse.json({ role: 'admin' }); // dev local
    }

    const client = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll() {},
      },
    });

    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const role = await getUserRole(user.id, user.email, (user as any).user_metadata);

    return NextResponse.json({
      id: user.id,
      email: user.email,
      role: role ?? 'vendedor',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
