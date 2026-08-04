import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export type AuthenticatedIdentity = {
  id: string;
  email: string | null;
  appRole: string | null;
};

const STAFF_ROLES = new Set(['admin', 'operator', 'viewer']);

function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder') &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function configuredAdminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function getAuthenticatedUser(req: NextRequest): Promise<AuthenticatedIdentity | null> {
  if (!configured()) {
    if (process.env.NODE_ENV === 'production') {
      console.error('ALERTA DE SEGURANÇA: Supabase não está configurado em produção.');
      return null;
    }
    return { id: 'local-development', email: 'local@development', appRole: 'admin' };
  }

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {},
      },
    },
  );

  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;

  return {
    id: user.id,
    email: user.email || null,
    appRole: typeof user.app_metadata?.role === 'string' ? user.app_metadata.role : null,
  };
}

export async function verifyAuth(req: NextRequest): Promise<boolean> {
  return Boolean(await getStaffUser(req));
}

export async function getStaffUser(req: NextRequest): Promise<AuthenticatedIdentity | null> {
  const user = await getAuthenticatedUser(req);
  if (!user) return null;

  if (user.appRole && STAFF_ROLES.has(user.appRole)) return user;

  const adminEmails = configuredAdminEmails();
  if (adminEmails.length > 0 && user.email && adminEmails.includes(user.email.toLowerCase())) {
    return { ...user, appRole: 'admin' };
  }

  if (process.env.NODE_ENV !== 'production' && adminEmails.length === 0) return user;

  console.warn(`Acesso de equipe bloqueado: ${user.email || user.id}.`);
  return null;
}

export async function getAdminUser(req: NextRequest): Promise<AuthenticatedIdentity | null> {
  const user = await getAuthenticatedUser(req);
  if (!user) return null;

  if (user.appRole === 'admin') return user;

  const adminEmails = configuredAdminEmails();
  if (adminEmails.length > 0 && user.email && adminEmails.includes(user.email.toLowerCase())) return user;

  if (process.env.NODE_ENV !== 'production' && adminEmails.length === 0) return user;

  console.warn(`Acesso administrativo bloqueado: ${user.email || user.id}.`);
  return null;
}

export async function verifyAdmin(req: NextRequest): Promise<boolean> {
  return Boolean(await getAdminUser(req));
}
