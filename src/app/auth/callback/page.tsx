'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/database/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        console.log('[AuthCallback] Processing authentication callback...');

        // セッションを確認
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('[AuthCallback] Error getting session:', error);
          router.push('/auth/login?error=callback_failed');
          return;
        }

        if (session) {
          console.log('[AuthCallback] Session found, redirecting to dashboard...');
          // ログイン成功後、ダッシュボードへリダイレクト
          router.push('/dashboard');
        } else {
          console.log('[AuthCallback] No session found, redirecting to login...');
          router.push('/auth/login');
        }
      } catch (error) {
        console.error('[AuthCallback] Unexpected error:', error);
        router.push('/auth/login?error=unexpected');
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">認証処理中...</h2>
        <p className="text-gray-600">しばらくお待ちください</p>
      </div>
    </div>
  );
}