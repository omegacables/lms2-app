import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/database/supabase';

export async function POST(request: NextRequest) {
  try {
    // user_course_assignments テーブルを作成
    const { error: createTableError } = await supabase.rpc('execute_sql', {
      query: `
        CREATE TABLE IF NOT EXISTS user_course_assignments (
          id SERIAL PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(user_id, course_id)
        );
      `
    });

    if (createTableError) {
      // テーブルが既に存在する場合やRPCが存在しない場合は、直接SQLを実行
      console.log('RPCでのテーブル作成に失敗しました。別の方法を試します。');

      // ここで簡単なテストクエリを実行してテーブルの存在を確認
      const { data: testData, error: testError } = await supabase
        .from('user_course_assignments')
        .select('id')
        .limit(1);

      if (testError && testError.code === '42P01') {
        // テーブルが存在しない場合
        return NextResponse.json(
          {
            error: 'テーブルの作成に失敗しました。Supabaseダッシュボードから手動で作成してください。',
            sql: `
              CREATE TABLE IF NOT EXISTS user_course_assignments (
                id SERIAL PRIMARY KEY,
                user_id UUID NOT NULL,
                course_id INTEGER NOT NULL,
                assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                assigned_by UUID,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(user_id, course_id)
              );
            `
          },
          { status: 500 }
        );
      }
    }

    // インデックスを作成
    try {
      await supabase.rpc('execute_sql', {
        query: `
          CREATE INDEX IF NOT EXISTS idx_user_course_assignments_user_id
          ON user_course_assignments(user_id);

          CREATE INDEX IF NOT EXISTS idx_user_course_assignments_course_id
          ON user_course_assignments(course_id);
        `
      });
    } catch (indexError) {
      console.log('インデックス作成はスキップされました（既に存在する可能性があります）');
    }

    // RLS（行レベルセキュリティ）ポリシーを設定
    try {
      await supabase.rpc('execute_sql', {
        query: `
          ALTER TABLE user_course_assignments ENABLE ROW LEVEL SECURITY;

          -- 管理者は全ての割り当てを閲覧・編集可能
          CREATE POLICY "管理者は全アクセス可能" ON user_course_assignments
            FOR ALL
            TO authenticated
            USING (
              EXISTS (
                SELECT 1 FROM user_profiles
                WHERE user_profiles.id = auth.uid()
                AND user_profiles.role = 'admin'
              )
            );

          -- ユーザーは自分の割り当てのみ閲覧可能
          CREATE POLICY "ユーザーは自分の割り当てを閲覧可能" ON user_course_assignments
            FOR SELECT
            TO authenticated
            USING (user_id = auth.uid());
        `
      });
    } catch (rlsError) {
      console.log('RLSポリシー設定はスキップされました（既に存在する可能性があります）');
    }

    return NextResponse.json({
      success: true,
      message: 'user_course_assignments テーブルが正常に作成されました（または既に存在します）'
    });

  } catch (error) {
    console.error('テーブル作成エラー:', error);
    return NextResponse.json(
      {
        error: 'テーブルの作成に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}