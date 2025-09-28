import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminSupabaseClient();

    // まずchaptersテーブルが存在するか確認
    const { data: tableCheck, error: tableError } = await supabase
      .from('chapters')
      .select('id')
      .limit(1);

    if (tableError && tableError.message.includes('does not exist')) {
      // テーブルが存在しない場合は作成
      const { error: createTableError } = await supabase.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS chapters (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            course_id integer NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            title text NOT NULL,
            display_order integer DEFAULT 0,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
          );

          -- インデックスを作成
          CREATE INDEX IF NOT EXISTS idx_chapters_course_id ON chapters(course_id);
          CREATE INDEX IF NOT EXISTS idx_chapters_display_order ON chapters(display_order);
        `
      });

      if (createTableError) {
        console.error('Error creating chapters table:', createTableError);
        return NextResponse.json({
          error: 'Failed to create chapters table',
          details: createTableError.message
        }, { status: 500 });
      }
    }

    // RLSを有効化
    const { error: enableRlsError } = await supabase.rpc('exec_sql', {
      sql: `ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;`
    });

    // 既存のポリシーを削除
    const policies = [
      'chapters_select_policy',
      'chapters_insert_policy',
      'chapters_update_policy',
      'chapters_delete_policy',
      'chapters_admin_all'
    ];

    for (const policyName of policies) {
      await supabase.rpc('exec_sql', {
        sql: `DROP POLICY IF EXISTS ${policyName} ON chapters;`
      });
    }

    // 新しいRLSポリシーを作成
    const createPolicies = [
      // 全ユーザーが読み取り可能
      {
        name: 'chapters_select_policy',
        sql: `
          CREATE POLICY chapters_select_policy ON chapters
          FOR SELECT
          USING (true);
        `
      },
      // 管理者とインストラクターが作成可能
      {
        name: 'chapters_insert_policy',
        sql: `
          CREATE POLICY chapters_insert_policy ON chapters
          FOR INSERT
          WITH CHECK (
            EXISTS (
              SELECT 1 FROM user_profiles
              WHERE user_profiles.id = auth.uid()
              AND user_profiles.role IN ('admin', 'instructor')
            )
          );
        `
      },
      // 管理者とインストラクターが更新可能
      {
        name: 'chapters_update_policy',
        sql: `
          CREATE POLICY chapters_update_policy ON chapters
          FOR UPDATE
          USING (
            EXISTS (
              SELECT 1 FROM user_profiles
              WHERE user_profiles.id = auth.uid()
              AND user_profiles.role IN ('admin', 'instructor')
            )
          );
        `
      },
      // 管理者とインストラクターが削除可能
      {
        name: 'chapters_delete_policy',
        sql: `
          CREATE POLICY chapters_delete_policy ON chapters
          FOR DELETE
          USING (
            EXISTS (
              SELECT 1 FROM user_profiles
              WHERE user_profiles.id = auth.uid()
              AND user_profiles.role IN ('admin', 'instructor')
            )
          );
        `
      }
    ];

    // ポリシーを作成
    for (const policy of createPolicies) {
      const { error } = await supabase.rpc('exec_sql', {
        sql: policy.sql
      });

      if (error) {
        console.error(`Error creating policy ${policy.name}:`, error);
      }
    }

    // videosテーブルにchapter_idカラムを追加（存在しない場合）
    const { error: addColumnError } = await supabase.rpc('exec_sql', {
      sql: `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'videos'
            AND column_name = 'chapter_id'
          ) THEN
            ALTER TABLE videos
            ADD COLUMN chapter_id uuid REFERENCES chapters(id) ON DELETE SET NULL;

            CREATE INDEX idx_videos_chapter_id ON videos(chapter_id);
          END IF;
        END $$;
      `
    });

    if (addColumnError) {
      console.error('Error adding chapter_id to videos:', addColumnError);
    }

    return NextResponse.json({
      success: true,
      message: 'Chapters table and RLS policies have been set up successfully',
      details: {
        table: 'created/verified',
        rls: 'enabled',
        policies: createPolicies.map(p => p.name),
        videosColumn: 'chapter_id added/verified'
      }
    });

  } catch (error) {
    console.error('Error setting up chapters:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}