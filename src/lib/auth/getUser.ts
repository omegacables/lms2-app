import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';

export type AuthedUser = { id: string; email?: string | null };

/**
 * リクエストから認証済みユーザーを取得する。
 * Authorization: Bearer トークン優先、無ければ Cookie セッション、無ければ body.access_token。
 * 失敗時は { user: null, response } を返す。
 */
export async function getAuthUser(
  request: NextRequest,
  bodyToken?: string | null
): Promise<{ user: AuthedUser | null; response?: NextResponse }> {
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const cookieStore = await cookies();
  const supabase = createServerSupabaseClient(cookieStore);

  const token = bearer || bodyToken || null;
  if (token) {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data?.user) return { user: { id: data.user.id, email: data.user.email } };
  }

  const { data } = await supabase.auth.getUser();
  if (data?.user) return { user: { id: data.user.id, email: data.user.email } };

  return {
    user: null,
    response: NextResponse.json({ error: '認証が必要です' }, { status: 401 }),
  };
}
