import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  // レスポンスオブジェクトを作成
  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  // メンテナンスページへのアクセスは常に許可
  if (req.nextUrl.pathname === '/maintenance') {
    return res;
  }

  // 管理者エリア（/admin/*）へのアクセスは常に許可
  // 管理者ページ内で認証チェックを行うため、middlewareではチェックしない
  if (req.nextUrl.pathname.startsWith('/admin')) {
    return res;
  }

  // ログインページと認証関連ページへのアクセスは常に許可
  if (req.nextUrl.pathname === '/auth/login' ||
      req.nextUrl.pathname === '/auth/signup' ||
      req.nextUrl.pathname === '/auth/reset-password') {
    return res;
  }

  // 緊急バイパスパラメータをチェック（一時的な対策）
  const bypassToken = req.nextUrl.searchParams.get('emergency_bypass');
  if (bypassToken === process.env.EMERGENCY_BYPASS_TOKEN) {
    console.log('[Middleware] Emergency bypass activated');
    return res;
  }

  // Supabaseクライアントを作成（SSR対応）
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const supabase = createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
          cookies: {
            get(name: string) {
              return req.cookies.get(name)?.value;
            },
            set(name: string, value: string, options: CookieOptions) {
              req.cookies.set({
                name,
                value,
                ...options,
              });
              res = NextResponse.next({
                request: {
                  headers: req.headers,
                },
              });
              res.cookies.set({
                name,
                value,
                ...options,
              });
            },
            remove(name: string, options: CookieOptions) {
              req.cookies.set({
                name,
                value: '',
                ...options,
              });
              res = NextResponse.next({
                request: {
                  headers: req.headers,
                },
              });
              res.cookies.set({
                name,
                value: '',
                ...options,
              });
            },
          },
        }
      );

      // システム設定からメンテナンスモードを取得
      const { data: maintenanceSetting, error: settingError } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'general.maintenance_mode')
        .maybeSingle();

      if (settingError) {
        console.error('[Middleware] Failed to read maintenance setting:', settingError);
        // RLSエラーの場合はメンテナンスモードをスキップ
        return res;
      }

      const isMaintenanceMode = maintenanceSetting?.setting_value === 'true';

      console.log('[Middleware] Maintenance setting:', maintenanceSetting);
      console.log('[Middleware] Maintenance mode:', isMaintenanceMode);

      // メンテナンスモード中の場合
      if (isMaintenanceMode) {
        // 現在のユーザーを取得
        const { data: { user } } = await supabase.auth.getUser();

        let isAdmin = false;

        if (user) {
          // まずJWTのメタデータからroleを取得
          const roleFromMetadata = user.app_metadata?.role || user.user_metadata?.role;

          if (roleFromMetadata) {
            isAdmin = roleFromMetadata === 'admin';
            console.log('[Middleware] Role from metadata:', roleFromMetadata, 'isAdmin:', isAdmin);
          } else {
            // メタデータにない場合はuser_profilesから取得（service roleを使用）
            const supabaseServiceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

            if (supabaseServiceUrl && supabaseServiceKey) {
              const { createClient } = await import('@supabase/supabase-js');
              const adminClient = createClient(supabaseServiceUrl, supabaseServiceKey, {
                auth: {
                  autoRefreshToken: false,
                  persistSession: false
                }
              });

              const { data: profile } = await adminClient
                .from('user_profiles')
                .select('role')
                .eq('id', user.id)
                .maybeSingle();

              isAdmin = profile?.role === 'admin';
              console.log('[Middleware] Role from DB (service role):', profile?.role, 'isAdmin:', isAdmin);
            } else {
              console.log('[Middleware] Service role key not available');
            }
          }
        } else {
          console.log('[Middleware] No user found');
        }

        // 管理者以外はメンテナンスページにリダイレクト
        if (!isAdmin) {
          console.log('[Middleware] Redirecting to maintenance page');
          return NextResponse.redirect(new URL('/maintenance', req.url));
        } else {
          console.log('[Middleware] Admin access granted, bypassing maintenance mode');
        }
      }
    } catch (error) {
      console.error('[Middleware] Maintenance check error:', error);
      // エラーが発生してもリクエストは通す
    }
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
};