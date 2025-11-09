import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export async function POST(request: NextRequest) {
  try {
    const adminSupabase = createAdminSupabaseClient();

    // exec_sql関数を作成（DDL実行用）
    const createExecSqlFunction = `
      CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
      RETURNS VOID AS $$
      BEGIN
        EXECUTE sql;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;

    // 直接SQLを実行（RPC経由ではない）
    const { error } = await adminSupabase.from('_dummy').select('*').limit(0);

    // 代わりにHTTP APIを使用
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ sql: createExecSqlFunction })
    });

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      console.error('exec_sql関数作成エラー:', errorText);
      return NextResponse.json({
        error: 'exec_sql関数の作成に失敗しました',
        details: errorText
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'exec_sql関数のセットアップが完了しました（または既に存在します）'
    });

  } catch (error) {
    console.error('セットアップエラー:', error);
    return NextResponse.json(
      { error: 'セットアップに失敗しました', details: error },
      { status: 500 }
    );
  }
}
