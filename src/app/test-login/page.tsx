'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/database/supabase';

export default function TestLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [envStatus, setEnvStatus] = useState<any>({});
  const [sessionStatus, setSessionStatus] = useState<any>({});

  useEffect(() => {
    // 環境変数の確認
    const env = {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT SET',
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'NOT SET',
    };
    setEnvStatus(env);

    // セッション確認
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      setSessionStatus({
        hasSession: !!session,
        user: session?.user?.email || 'None',
        error: error?.message || 'None',
      });
    } catch (err) {
      setSessionStatus({
        error: (err as Error).message,
      });
    }
  };

  const testLogin = async () => {
    setStatus('ログイン処理開始...');

    try {
      console.log('Login attempt with:', email);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setStatus(`エラー: ${error.message}`);
        console.error('Login error:', error);
        return;
      }

      if (data.user) {
        setStatus(`ログイン成功！ User: ${data.user.email}`);
        console.log('Login successful:', data.user);

        // 3秒後にリダイレクトを試みる
        setTimeout(() => {
          setStatus('リダイレクト中...');
          window.location.href = '/dashboard';
        }, 3000);
      }
    } catch (err) {
      setStatus(`予期しないエラー: ${(err as Error).message}`);
      console.error('Unexpected error:', err);
    }
  };

  const testLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setStatus(`ログアウトエラー: ${error.message}`);
    } else {
      setStatus('ログアウト成功');
      await checkSession();
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gray-100">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6">デバッグ用ログインページ</h1>

        {/* 環境変数状態 */}
        <div className="mb-6 p-4 bg-gray-50 rounded">
          <h2 className="font-bold mb-2">環境変数の状態</h2>
          <pre className="text-sm">{JSON.stringify(envStatus, null, 2)}</pre>
        </div>

        {/* セッション状態 */}
        <div className="mb-6 p-4 bg-gray-50 rounded">
          <h2 className="font-bold mb-2">現在のセッション</h2>
          <pre className="text-sm">{JSON.stringify(sessionStatus, null, 2)}</pre>
          <button
            onClick={checkSession}
            className="mt-2 px-3 py-1 bg-blue-500 text-white rounded text-sm"
          >
            再確認
          </button>
        </div>

        {/* ログインフォーム */}
        <div className="mb-6">
          <h2 className="font-bold mb-4">ログインテスト</h2>
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mb-3 px-3 py-2 border rounded"
          />
          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mb-3 px-3 py-2 border rounded"
          />
          <div className="flex gap-2">
            <button
              onClick={testLogin}
              className="px-4 py-2 bg-green-500 text-white rounded"
            >
              ログイン
            </button>
            <button
              onClick={testLogout}
              className="px-4 py-2 bg-red-500 text-white rounded"
            >
              ログアウト
            </button>
          </div>
        </div>

        {/* ステータス表示 */}
        {status && (
          <div className="p-4 bg-blue-50 rounded">
            <h2 className="font-bold mb-2">ステータス</h2>
            <p>{status}</p>
          </div>
        )}

        {/* コンソールログ確認方法 */}
        <div className="mt-6 p-4 bg-yellow-50 rounded">
          <h2 className="font-bold mb-2">デバッグ方法</h2>
          <ol className="text-sm space-y-1 list-decimal list-inside">
            <li>F12キーでDevToolsを開く</li>
            <li>Consoleタブでログを確認</li>
            <li>Networkタブでリクエストを確認</li>
            <li>上記フォームでログインをテスト</li>
          </ol>
        </div>
      </div>
    </div>
  );
}