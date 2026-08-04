import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser, getStaffUser } from '@/lib/auth-server';

export async function GET(request: NextRequest) {
  const staff = await getStaffUser(request);
  if (!staff) {
    return NextResponse.json(
      { success: false, error: 'Nao autorizado.' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const admin = await getAdminUser(request);
  return NextResponse.json(
    {
      success: true,
      email: staff.email,
      role: admin ? 'admin' : staff.appRole || 'viewer',
      isAdmin: Boolean(admin),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
