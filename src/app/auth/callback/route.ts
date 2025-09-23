import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  console.log('[Auth Callback] Processing authentication callback...');
  
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/dashboard';
  
  console.log('[Auth Callback] Received code:', code ? 'Yes' : 'No');
  console.log('[Auth Callback] Redirect destination:', next);

  if (code) {
    try {
      const cookieStore = await cookies();
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get(name: string) {
              return cookieStore.get(name)?.value;
            },
            set(name: string, value: string, options: any) {
              cookieStore.set({ name, value, ...options });
            },
            remove(name: string, options: any) {
              cookieStore.set({ name, value: '', ...options });
            },
          },
        }
      );
      
      console.log('[Auth Callback] Exchanging code for session...');
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (error) {
        console.error('[Auth Callback] Error exchanging code:', error);
        return NextResponse.redirect(new URL('/auth/login?error=auth_failed', requestUrl.origin));
      }
      
      console.log('[Auth Callback] Session established successfully');
      console.log('[Auth Callback] User:', data.session?.user?.email);
      
      // ユーザー情報を取得してロールを確認
      if (data.session?.user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', data.session.user.id)
          .single();
        
        console.log('[Auth Callback] User role:', profile?.role);
        
        // ロールに応じてリダイレクト先を決定
        let redirectUrl = next;
        if (profile?.role === 'admin') {
          redirectUrl = '/admin';
        } else if (profile?.role === 'instructor') {
          redirectUrl = '/instructor';
        }
        
        console.log('[Auth Callback] Final redirect URL:', redirectUrl);
        return NextResponse.redirect(new URL(redirectUrl, requestUrl.origin));
      }
    } catch (error) {
      console.error('[Auth Callback] Unexpected error:', error);
      return NextResponse.redirect(new URL('/auth/login?error=unexpected', requestUrl.origin));
    }
  }

  console.log('[Auth Callback] No code provided, redirecting to login');
  return NextResponse.redirect(new URL('/auth/login', requestUrl.origin));
}