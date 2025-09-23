import { NextResponse } from 'next/server';

export async function GET() {
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    environment: {},
    connection: {},
    auth: {},
    recommendations: []
  };

  // 1. 環境変数チェック
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  diagnostics.environment = {
    hasUrl: !!supabaseUrl,
    hasAnonKey: !!supabaseAnonKey,
    urlFormat: supabaseUrl ? (supabaseUrl.includes('supabase.co') ? 'valid' : 'suspicious') : 'missing',
    url: supabaseUrl ? `${supabaseUrl.substring(0, 40)}...` : 'NOT SET',
  };

  if (!supabaseUrl || !supabaseAnonKey) {
    diagnostics.recommendations.push('環境変数が設定されていません。.env.localファイルを確認してください。');
    return NextResponse.json(diagnostics, { status: 500 });
  }

  // 2. 直接的なHTTP接続テスト
  try {
    console.log('[Diagnosis] Testing direct HTTP connection to Supabase...');
    const startTime = Date.now();
    
    // HealthチェックエンドポイントへのGETリクエスト
    const healthResponse = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      signal: AbortSignal.timeout(10000), // 10秒のタイムアウト
    });

    diagnostics.connection = {
      status: healthResponse.ok ? 'ok' : 'error',
      statusCode: healthResponse.status,
      responseTime: Date.now() - startTime,
      headers: Object.fromEntries(healthResponse.headers.entries()),
    };

    if (!healthResponse.ok) {
      diagnostics.recommendations.push(`Supabase APIが応答していません。ステータスコード: ${healthResponse.status}`);
    }
  } catch (error: any) {
    diagnostics.connection = {
      status: 'error',
      error: error.message,
      type: error.name,
    };
    
    if (error.name === 'AbortError') {
      diagnostics.recommendations.push('Supabaseへの接続がタイムアウトしました。ネットワーク接続を確認してください。');
    } else if (error.message.includes('fetch')) {
      diagnostics.recommendations.push('ネットワークエラー: Supabaseサーバーに接続できません。');
    } else {
      diagnostics.recommendations.push(`接続エラー: ${error.message}`);
    }
  }

  // 3. 認証エンドポイントテスト
  try {
    console.log('[Diagnosis] Testing auth endpoint...');
    const authStartTime = Date.now();
    
    // 認証APIの健全性チェック（無効な認証情報でテスト）
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@test.com',
        password: 'test123',
      }),
      signal: AbortSignal.timeout(10000),
    });

    const authData = await authResponse.json();
    
    diagnostics.auth = {
      status: authResponse.status === 400 ? 'ok' : 'warning', // 400は期待される無効な認証エラー
      statusCode: authResponse.status,
      responseTime: Date.now() - authStartTime,
      message: authData.error || authData.msg || 'Auth endpoint responding',
    };

    if (authResponse.status !== 400 && authResponse.status !== 401) {
      diagnostics.recommendations.push(`認証エンドポイントが異常な応答をしています: ${authResponse.status}`);
    }
  } catch (error: any) {
    diagnostics.auth = {
      status: 'error',
      error: error.message,
    };
    diagnostics.recommendations.push(`認証エンドポイントエラー: ${error.message}`);
  }

  // 4. Supabase CLIクライアントテスト
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const testClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // セッション取得テスト
    const sessionStartTime = Date.now();
    const { data, error } = await testClient.auth.getSession();
    
    diagnostics.clientTest = {
      status: error ? 'error' : 'ok',
      responseTime: Date.now() - sessionStartTime,
      error: error?.message,
      hasSession: !!data?.session,
    };

    if (error) {
      diagnostics.recommendations.push(`Supabaseクライアントエラー: ${error.message}`);
    }
  } catch (error: any) {
    diagnostics.clientTest = {
      status: 'error',
      error: error.message,
    };
    diagnostics.recommendations.push(`クライアント初期化エラー: ${error.message}`);
  }

  // 5. 総合診断
  const overallStatus = 
    diagnostics.connection.status === 'ok' && 
    diagnostics.auth.status === 'ok' 
      ? 'healthy' 
      : diagnostics.connection.status === 'error' 
        ? 'critical' 
        : 'degraded';

  diagnostics.overall = {
    status: overallStatus,
    recommendationCount: diagnostics.recommendations.length,
  };

  // 推奨事項の追加
  if (diagnostics.recommendations.length === 0) {
    diagnostics.recommendations.push('すべてのチェックが正常です。');
  }

  // レスポンスタイムが遅い場合の推奨
  if (diagnostics.connection.responseTime > 5000) {
    diagnostics.recommendations.push('レスポンスタイムが遅いです。ネットワーク環境またはSupabaseプロジェクトのリージョンを確認してください。');
  }

  return NextResponse.json(diagnostics, { 
    status: overallStatus === 'critical' ? 500 : 200 
  });
}