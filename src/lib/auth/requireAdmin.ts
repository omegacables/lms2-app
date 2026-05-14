import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';

export type AdminAuthOk = {
  ok: true;
  user: { id: string; email?: string | null };
  role: 'admin';
};

export type AdminAuthFail = {
  ok: false;
  response: NextResponse;
};

export type AdminAuthResult = AdminAuthOk | AdminAuthFail;

/**
 * 管理者として認証されているかを検証する共通ヘルパー。
 *
 * - Authorization: Bearer ヘッダがあればそれを優先（localStorage 保存の Supabase クライアントに対応）
 * - 無ければ Cookie ベースの SSR セッションを使用
 * - role は service role クライアントで照会して RLS の影響を受けないようにする
 *
 * 使い方:
 *   const auth = await requireAdmin(request);
 *   if (!auth.ok) return auth.response;
 *   // auth.user で admin ユーザーが取れる
 */
export async function requireAdmin(request: NextRequest): Promise<AdminAuthResult> {
  // 1. 認証トークンを取得（ヘッダ優先）
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

  // 2. role を service role で照会（RLS をバイパス）
  const adminClient = createAdminSupabaseClient();
  const { data: profile, error: profileError } = await adminClient
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    console.error('[requireAdmin] profile lookup failed:', profileError);
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'ユーザープロフィールが取得できませんでした' },
        { status: 403 }
      ),
    };
  }

  if (profile.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, user, role: 'admin' };
}
