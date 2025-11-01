import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function middleware(req: NextRequest) {
  // メンテナンスモードのチェック（最優先）
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);

      // システム設定からメンテナンスモードを取得
      const { data: maintenanceSetting } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'general.maintenance_mode')
        .maybeSingle();

      const isMaintenanceMode = maintenanceSetting?.setting_value === 'true';

      // メンテナンスページへのアクセスは常に許可
      if (req.nextUrl.pathname === '/maintenance') {
        return NextResponse.next();
      }

      // メンテナンスモード中の場合
      if (isMaintenanceMode) {
        // ログインユーザーのロールを確認
        const token = req.cookies.get('sb-access-token')?.value;
        let isAdmin = false;

        if (token) {
          const { data: { user } } = await supabase.auth.getUser(token);

          if (user) {
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('role')
              .eq('id', user.id)
              .maybeSingle();

            isAdmin = profile?.role === 'admin';
          }
        }

        // 管理者以外はメンテナンスページにリダイレクト
        if (!isAdmin) {
          return NextResponse.redirect(new URL('/maintenance', req.url));
        }
      }
    } catch (error) {
      console.error('[Middleware] Maintenance check error:', error);
      // エラーが発生してもリクエストは通す
    }
  }

  // 一時的にミドルウェアを無効化してログイン問題を解決
  return NextResponse.next();

  console.log('[Middleware] Processing request to:', req.nextUrl.pathname);

  // セッションの更新を確認
  try {
    // まずセッションを取得・リフレッシュ
    const { data: { session }, error } = await supabase.auth.getSession();
    
    console.log('[Middleware] Raw session data:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      userEmail: session?.user?.email,
      accessToken: session?.access_token ? 'present' : 'missing',
      expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      error: error?.message
    });
    
    if (error) {
      console.error('[Middleware] Session error:', error);
    } else {
      console.log('[Middleware] Session status:', session ? 'Active' : 'None');
      if (session) {
        console.log('[Middleware] User:', session.user.email);
        console.log('[Middleware] Token expires at:', session.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'unknown');
      }
    }
    
    // 保護されたルートのチェック
    const protectedRoutes = ['/dashboard', '/admin', '/instructor', '/courses', '/profile', '/settings'];
    const isProtectedRoute = protectedRoutes.some(route =>
      req.nextUrl.pathname.startsWith(route)
    );

    // 認証関連ルートのチェック
    const authRoutes = ['/auth/login', '/auth/signup', '/auth/reset-password'];
    const isAuthRoute = authRoutes.some(route => 
      req.nextUrl.pathname.startsWith(route)
    );
    
    // OAuth callback route - always allow
    const isOAuthCallback = req.nextUrl.pathname === '/auth/callback';
    if (isOAuthCallback) {
      console.log('[Middleware] OAuth callback route - allowing through');
      return res;
    }

    // 保護されたルートで未認証の場合
    if (isProtectedRoute && !session) {
      console.log('[Middleware] Redirecting to login (no session)');
      const redirectUrl = new URL('/auth/login', req.url);
      redirectUrl.searchParams.set('redirectTo', req.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // 認証済みでログインページにアクセスした場合
    if (isAuthRoute && session) {
      console.log('[Middleware] User already authenticated, checking redirect destination');
      
      // リダイレクト先を決定（redirectToパラメータがあればそれを優先）
      const redirectTo = req.nextUrl.searchParams.get('redirectTo');
      let redirectUrl: string;
      
      if (redirectTo) {
        redirectUrl = redirectTo;
        console.log('[Middleware] Using redirectTo parameter:', redirectUrl);
      } else {
        // デフォルトのリダイレクト先（ダッシュボード）
        redirectUrl = '/dashboard';
        console.log('[Middleware] Using default redirect:', redirectUrl);
      }
      
      return NextResponse.redirect(new URL(redirectUrl, req.url));
    }

    return res;
  } catch (middlewareError) {
    console.error('[Middleware] Unexpected error:', middlewareError);
    // エラーが発生した場合はミドルウェアをパススルー
    return res;
  }
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