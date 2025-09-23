import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/database/supabase';

export async function POST(request: NextRequest) {
  try {
    // video_resources テーブルを作成
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS video_resources (
        id SERIAL PRIMARY KEY,
        video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        resource_type VARCHAR(50) NOT NULL, -- 'material', 'assignment', 'reference', 'explanation'
        title VARCHAR(255) NOT NULL,
        description TEXT,
        file_url TEXT,
        file_name VARCHAR(255),
        file_size INTEGER,
        file_type VARCHAR(100),
        content TEXT, -- For text-based resources like explanations
        display_order INTEGER DEFAULT 0,
        is_required BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
      );

      -- インデックスを作成
      CREATE INDEX IF NOT EXISTS idx_video_resources_video_id ON video_resources(video_id);
      CREATE INDEX IF NOT EXISTS idx_video_resources_type ON video_resources(resource_type);
      CREATE INDEX IF NOT EXISTS idx_video_resources_display_order ON video_resources(display_order);
    `;

    // assignment_submissions テーブルを作成（課題提出用）
    const createSubmissionsTableQuery = `
      CREATE TABLE IF NOT EXISTS assignment_submissions (
        id SERIAL PRIMARY KEY,
        resource_id INTEGER NOT NULL REFERENCES video_resources(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        submission_text TEXT,
        file_url TEXT,
        file_name VARCHAR(255),
        file_size INTEGER,
        file_type VARCHAR(100),
        status VARCHAR(50) DEFAULT 'submitted', -- 'submitted', 'reviewing', 'approved', 'rejected', 'needs_revision'
        feedback TEXT,
        score INTEGER,
        submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        reviewed_at TIMESTAMP WITH TIME ZONE,
        reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
        UNIQUE(resource_id, user_id)
      );

      -- インデックスを作成
      CREATE INDEX IF NOT EXISTS idx_assignment_submissions_resource_id ON assignment_submissions(resource_id);
      CREATE INDEX IF NOT EXISTS idx_assignment_submissions_user_id ON assignment_submissions(user_id);
      CREATE INDEX IF NOT EXISTS idx_assignment_submissions_status ON assignment_submissions(status);
    `;

    // テーブル作成を試みる
    try {
      // RPCが利用可能か確認
      const { error: rpcError } = await supabase.rpc('execute_sql', {
        query: createTableQuery
      });

      if (rpcError) {
        throw rpcError;
      }

      // 課題提出テーブルも作成
      await supabase.rpc('execute_sql', {
        query: createSubmissionsTableQuery
      });

    } catch (error) {
      console.log('RPCでのテーブル作成に失敗しました。テーブルの存在を確認します。');

      // テーブルの存在確認
      const { data: testData, error: testError } = await supabase
        .from('video_resources')
        .select('id')
        .limit(1);

      if (testError && testError.code === '42P01') {
        // テーブルが存在しない場合
        return NextResponse.json(
          {
            error: 'テーブルの作成に失敗しました。Supabaseダッシュボードから手動で作成してください。',
            sql: {
              video_resources: createTableQuery,
              assignment_submissions: createSubmissionsTableQuery
            }
          },
          { status: 500 }
        );
      }
    }

    // RLS（行レベルセキュリティ）ポリシーを設定
    try {
      const rlsQuery = `
        ALTER TABLE video_resources ENABLE ROW LEVEL SECURITY;
        ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;

        -- video_resources policies
        -- 誰でも閲覧可能
        CREATE POLICY IF NOT EXISTS "Anyone can view video resources" ON video_resources
          FOR SELECT
          TO authenticated
          USING (true);

        -- 管理者とインストラクターのみ作成・更新・削除可能
        CREATE POLICY IF NOT EXISTS "Admin and instructors can manage resources" ON video_resources
          FOR ALL
          TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM user_profiles
              WHERE user_profiles.id = auth.uid()
              AND user_profiles.role IN ('admin', 'instructor')
            )
          );

        -- assignment_submissions policies
        -- ユーザーは自分の提出を閲覧・作成・更新可能
        CREATE POLICY IF NOT EXISTS "Users can manage own submissions" ON assignment_submissions
          FOR ALL
          TO authenticated
          USING (user_id = auth.uid());

        -- 管理者とインストラクターは全ての提出を閲覧・更新可能
        CREATE POLICY IF NOT EXISTS "Admin and instructors can view all submissions" ON assignment_submissions
          FOR SELECT
          TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM user_profiles
              WHERE user_profiles.id = auth.uid()
              AND user_profiles.role IN ('admin', 'instructor')
            )
          );

        CREATE POLICY IF NOT EXISTS "Admin and instructors can update submissions" ON assignment_submissions
          FOR UPDATE
          TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM user_profiles
              WHERE user_profiles.id = auth.uid()
              AND user_profiles.role IN ('admin', 'instructor')
            )
          );
      `;

      await supabase.rpc('execute_sql', { query: rlsQuery });
    } catch (rlsError) {
      console.log('RLSポリシー設定はスキップされました（既に存在する可能性があります）');
    }

    return NextResponse.json({
      success: true,
      message: 'video_resources および assignment_submissions テーブルが正常に作成されました（または既に存在します）'
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