import { NextResponse } from 'next/server';
import { supabase } from '@/lib/database/supabase';

export async function GET() {
  const results = {
    timestamp: new Date().toISOString(),
    checks: {
      environment: {
        status: 'unknown',
        hasUrl: false,
        hasAnonKey: false,
      },
      connection: {
        status: 'unknown',
        message: '',
        responseTime: 0,
      },
      auth: {
        status: 'unknown',
        message: '',
        responseTime: 0,
      },
      database: {
        status: 'unknown',
        message: '',
        responseTime: 0,
      },
    },
  };

  // 1. 環境変数チェック
  results.checks.environment.hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  results.checks.environment.hasAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  results.checks.environment.status = 
    results.checks.environment.hasUrl && results.checks.environment.hasAnonKey ? 'ok' : 'error';

  // 2. Supabase接続チェック
  try {
    const startTime = Date.now();
    const { data, error } = await supabase.auth.getSession();
    results.checks.connection.responseTime = Date.now() - startTime;
    
    if (error) {
      results.checks.connection.status = 'error';
      results.checks.connection.message = error.message;
    } else {
      results.checks.connection.status = 'ok';
      results.checks.connection.message = 'Connection successful';
    }
  } catch (error) {
    results.checks.connection.status = 'error';
    results.checks.connection.message = (error as Error).message;
  }

  // 3. 認証サービスチェック
  try {
    const startTime = Date.now();
    // 無効な認証情報でテスト（エラーが返ることを期待）
    const { error } = await supabase.auth.signInWithPassword({
      email: 'test@test.com',
      password: 'test123',
    });
    results.checks.auth.responseTime = Date.now() - startTime;
    
    // エラーが返れば認証サービスは動作している
    if (error) {
      results.checks.auth.status = 'ok';
      results.checks.auth.message = 'Auth service responding';
    } else {
      results.checks.auth.status = 'warning';
      results.checks.auth.message = 'Unexpected success with test credentials';
    }
  } catch (error) {
    results.checks.auth.status = 'error';
    results.checks.auth.message = (error as Error).message;
  }

  // 4. データベース接続チェック
  try {
    const startTime = Date.now();
    const { count, error } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });
    results.checks.database.responseTime = Date.now() - startTime;
    
    if (error) {
      results.checks.database.status = 'error';
      results.checks.database.message = error.message;
    } else {
      results.checks.database.status = 'ok';
      results.checks.database.message = `Database accessible (${count ?? 0} profiles)`;
    }
  } catch (error) {
    results.checks.database.status = 'error';
    results.checks.database.message = (error as Error).message;
  }

  // 全体のステータスを判定
  const allChecks = Object.values(results.checks);
  const hasError = allChecks.some(check => 
    typeof check === 'object' && 'status' in check && check.status === 'error'
  );
  const overallStatus = hasError ? 'error' : 'ok';

  return NextResponse.json({
    ...results,
    overallStatus,
    recommendation: getRecommendation(results),
  });
}

function getRecommendation(results: any): string {
  const checks = results.checks;
  
  if (checks.environment.status === 'error') {
    return '環境変数が正しく設定されていません。.env.localファイルを確認してください。';
  }
  
  if (checks.connection.status === 'error') {
    if (checks.connection.message.includes('timeout')) {
      return 'Supabaseへの接続がタイムアウトしています。ネットワーク接続またはSupabaseプロジェクトのステータスを確認してください。';
    }
    return `接続エラー: ${checks.connection.message}`;
  }
  
  if (checks.auth.status === 'error') {
    return `認証サービスエラー: ${checks.auth.message}`;
  }
  
  if (checks.database.status === 'error') {
    return `データベースエラー: ${checks.database.message}`;
  }
  
  // レスポンスタイムが遅い場合
  const slowThreshold = 5000; // 5秒
  if (checks.connection.responseTime > slowThreshold ||
      checks.auth.responseTime > slowThreshold ||
      checks.database.responseTime > slowThreshold) {
    return 'レスポンスタイムが遅いです。ネットワーク環境を確認してください。';
  }
  
  return 'すべてのチェックが正常です。';
}