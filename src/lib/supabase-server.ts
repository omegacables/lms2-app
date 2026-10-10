import { createServerClient as createSsrClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Route Handler 用の Supabase クライアント（Cookie セッション）
 * 以前は @supabase/auth-helpers-nextjs を使っていたが、廃止されたため @supabase/ssr に置き換えた。
 */
export async function createServerClient() {
  const cookieStore = await cookies();

  return createSsrClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component から呼ばれた場合は Cookie を書けないので無視する
        }
      },
    },
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
