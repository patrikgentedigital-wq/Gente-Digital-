import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export async function GET() {
  try {
    const { data: logs, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ success: true, logs: [] });
    }

    return NextResponse.json({ success: true, logs });
  } catch (err: any) {
    return NextResponse.json({ success: true, logs: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, details, user_email } = body;

    const { data, error } = await supabase.from('audit_logs').insert([{
      action,
      details,
      user_email: user_email || 'Admin',
      created_at: new Date().toISOString()
    }]).select();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, log: data[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
