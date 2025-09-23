import { NextResponse } from 'next/server';
import { supabase } from '@/lib/database/supabase';

export async function GET() {
  const results = {
    timestamp: new Date().toISOString(),
    checks: [] as any[],
    errors: [] as any[],
    summary: {
      total: 0,
      passed: 0,
      failed: 0
    }
  };

  // 1. Supabase接続テスト
  try {
    const { data, error } = await supabase.from('user_profiles').select('count').limit(1);
    results.checks.push({
      name: 'Supabase Connection',
      status: error ? 'FAILED' : 'PASSED',
      message: error ? error.message : 'Connected successfully',
      details: { data, error }
    });
  } catch (e) {
    results.checks.push({
      name: 'Supabase Connection',
      status: 'FAILED',
      message: e instanceof Error ? e.message : 'Unknown error',
      details: { error: e }
    });
  }

  // 2. 認証状態の確認
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    results.checks.push({
      name: 'Auth Session',
      status: session ? 'PASSED' : 'WARNING',
      message: session ? 'Session active' : 'No active session',
      details: { hasSession: !!session, error }
    });
  } catch (e) {
    results.checks.push({
      name: 'Auth Session',
      status: 'FAILED',
      message: e instanceof Error ? e.message : 'Unknown error'
    });
  }

  // 3. 主要テーブルの存在確認
  const tables = ['user_profiles', 'courses', 'videos', 'video_view_logs'];
  for (const table of tables) {
    try {
      const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      results.checks.push({
        name: `Table: ${table}`,
        status: error ? 'FAILED' : 'PASSED',
        message: error ? error.message : `Table exists (${count} records)`,
        details: { count, error }
      });
    } catch (e) {
      results.checks.push({
        name: `Table: ${table}`,
        status: 'FAILED',
        message: e instanceof Error ? e.message : 'Unknown error'
      });
    }
  }

  // 4. RLSポリシーのテスト（user_profiles）
  try {
    const { data, error } = await supabase.from('user_profiles').select('id').limit(1);
    results.checks.push({
      name: 'RLS Policy Test',
      status: error && error.code === 'PGRST301' ? 'WARNING' : 'PASSED',
      message: error ? `RLS might be blocking: ${error.message}` : 'RLS policies working',
      details: { data, error }
    });
  } catch (e) {
    results.checks.push({
      name: 'RLS Policy Test',
      status: 'FAILED',
      message: e instanceof Error ? e.message : 'Unknown error'
    });
  }

  // 5. Storageバケットの確認
  try {
    const { data, error } = await supabase.storage.listBuckets();
    results.checks.push({
      name: 'Storage Buckets',
      status: error ? 'FAILED' : 'PASSED',
      message: error ? error.message : `${data?.length || 0} buckets found`,
      details: { buckets: data?.map(b => b.name), error }
    });
  } catch (e) {
    results.checks.push({
      name: 'Storage Buckets',
      status: 'FAILED',
      message: e instanceof Error ? e.message : 'Unknown error'
    });
  }

  // サマリー計算
  results.summary.total = results.checks.length;
  results.summary.passed = results.checks.filter(c => c.status === 'PASSED').length;
  results.summary.failed = results.checks.filter(c => c.status === 'FAILED').length;

  // 診断結果に基づくアドバイス
  const advice = [];
  
  if (results.checks.find(c => c.name === 'Supabase Connection' && c.status === 'FAILED')) {
    advice.push('❌ Supabase接続に失敗しています。環境変数を確認してください。');
  }
  
  if (results.checks.find(c => c.name.startsWith('Table:') && c.status === 'FAILED')) {
    advice.push('❌ 一部のテーブルが存在しません。schema.sqlを実行してください。');
  }
  
  if (results.checks.find(c => c.name === 'RLS Policy Test' && c.status === 'WARNING')) {
    advice.push('⚠️ RLSポリシーが厳しすぎる可能性があります。ポリシーを確認してください。');
  }

  if (results.summary.failed === 0) {
    advice.push('✅ すべてのチェックが正常です！');
  }

  return NextResponse.json({
    ...results,
    advice,
    recommendation: results.summary.failed > 0 
      ? 'データベース設定に問題があります。上記のアドバイスを確認してください。'
      : 'データベース接続は正常です。'
  });
}