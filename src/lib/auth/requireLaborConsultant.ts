import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';

export type LaborConsultantAuthOk = {
  ok: true;
  user: { id: string; email?: string | null };
  role: 'labor_consultant' | 'admin';
};

export type LaborConsultantAuthFail = {
  ok: false;
  response: NextResponse;
};

export type LaborConsultantAuthResult = LaborConsultantAuthOk | LaborConsultantAuthFail;

/**
 * 社労士 (labor_consultant) または admin として認証されているかを検証する共通ヘルパー。
 * requireAdmin と同じ方式（Bearer ヘッダ優先 + cookie フォールバック + service role でロール照会）。
 */
export async function requireLaborConsultant(
  request: NextRequest
): Promise<LaborConsultantAuthResult> {
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const cookieStore = await cookies();
  const supabase = createServerSupabaseClient(cookieStore);

  let user: { id: string; email?: string | null } | null = null;

  if (bearerToken) {
    const { data, error } = await supabase.auth.getUser(bearerToken);
    if (!error && data?.user) {
      user = { id: data.user.id, email: data.user.email };
    }
  }

  if (!user) {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      user = { id: data.user.id, email: data.user.email };
    }
  }

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: '認証が必要です' }, { status: 401 }),
    };
  }

  const adminClient = createAdminSupabaseClient();
  const { data: profile } = await adminClient
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'ユーザープロフィールが取得できませんでした' },
        { status: 403 }
      ),
    };
  }

  if (profile.role !== 'labor_consultant' && profile.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: '社労士または管理者権限が必要です' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, user, role: profile.role };
}
