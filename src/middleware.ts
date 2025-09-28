import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareSupabaseClient } from '@/lib/database/supabase';

export async function middleware(req: NextRequest) {
  // APIルートとスタティックファイルはスキップ
  if (
    req.nextUrl.pathname.startsWith('/api') ||
    req.nextUrl.pathname.startsWith('/_next') ||
    req.nextUrl.pathname.startsWith('/favicon.ico')
  ) {
    return NextResponse.next();
  }

  const { supabase, response } = createMiddlewareSupabaseClient(req);
  let res = response;

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