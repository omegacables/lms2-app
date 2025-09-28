import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { Database } from './database.types';
import type { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies';

/**
 * Next.js 15対応のSupabaseクライアント作成関数
 * Route Handlerで使用
 */
export async function createServerClient() {
  const cookieStore = await cookies();

  return createRouteHandlerClient<Database>({
    cookies: () => cookieStore
  });
}

/**
 * Cookie Storeを渡してSupabaseクライアントを作成
 * APIルートで使用
 */
export function createServerSupabaseClient(cookieStore: RequestCookies) {
  return createRouteHandlerClient<Database>({
    cookies: () => cookieStore
  });
}

/**
 * 認証チェック付きのSupabaseクライアント作成
 * 401エラーを自動で返す
 */
export async function createAuthenticatedClient() {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { supabase: null, user: null, error: 'Unauthorized' };
  }

  return { supabase, user, error: null };
}

/**
 * 管理者権限チェック付きのSupabaseクライアント作成
 * 401/403エラーを自動で返す
 */
export async function createAdminClient() {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { supabase: null, user: null, error: 'Unauthorized', status: 401 };
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return { supabase: null, user: null, error: 'Forbidden', status: 403 };
  }

  return { supabase, user, error: null, status: 200 };
}