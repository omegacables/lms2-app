import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export async function POST(request: NextRequest) {
  try {
    const adminSupabase = createAdminSupabaseClient();

    console.log('コースグループテーブルの作成を開始します...');

    // テーブルが既に存在するか確認
    const { data: existingGroups } = await adminSupabase
      .from('course_groups')
      .select('id')
      .limit(1);

    if (existingGroups !== null) {
      return NextResponse.json({
        success: true,
        message: 'テーブルは既に存在します',
        tables: ['course_groups', 'course_group_items']
      });
    }

    // Supabase管理画面で実行するSQLを返す
    const sqlScript = `
-- course_groups テーブルを作成
CREATE TABLE IF NOT EXISTS course_groups (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  is_sequential BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- course_group_items テーブルを作成
CREATE TABLE IF NOT EXISTS course_group_items (
  id BIGSERIAL PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES course_groups(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, course_id)
);

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_course_group_items_group_id ON course_group_items(group_id);
CREATE INDEX IF NOT EXISTS idx_course_group_items_course_id ON course_group_items(course_id);
CREATE INDEX IF NOT EXISTS idx_course_group_items_order ON course_group_items(group_id, order_index);

-- course_groups のRLS有効化
ALTER TABLE course_groups ENABLE ROW LEVEL SECURITY;

-- 誰でも読み取り可能
DROP POLICY IF EXISTS "course_groups_select_policy" ON course_groups;
CREATE POLICY "course_groups_select_policy" ON course_groups
  FOR SELECT USING (true);

-- 管理者・講師のみ作成・更新・削除可能
DROP POLICY IF EXISTS "course_groups_insert_policy" ON course_groups;
CREATE POLICY "course_groups_insert_policy" ON course_groups
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT id FROM user_profiles
      WHERE role IN ('admin', 'instructor')
    )
  );

DROP POLICY IF EXISTS "course_groups_update_policy" ON course_groups;
CREATE POLICY "course_groups_update_policy" ON course_groups
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM user_profiles
      WHERE role IN ('admin', 'instructor')
    )
  );

DROP POLICY IF EXISTS "course_groups_delete_policy" ON course_groups;
CREATE POLICY "course_groups_delete_policy" ON course_groups
  FOR DELETE USING (
    auth.uid() IN (
      SELECT id FROM user_profiles
      WHERE role IN ('admin', 'instructor')
    )
  );

-- course_group_items のRLS有効化
ALTER TABLE course_group_items ENABLE ROW LEVEL SECURITY;

-- 誰でも読み取り可能
DROP POLICY IF EXISTS "course_group_items_select_policy" ON course_group_items;
CREATE POLICY "course_group_items_select_policy" ON course_group_items
  FOR SELECT USING (true);

-- 管理者・講師のみ作成・更新・削除可能
DROP POLICY IF EXISTS "course_group_items_insert_policy" ON course_group_items;
CREATE POLICY "course_group_items_insert_policy" ON course_group_items
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT id FROM user_profiles
      WHERE role IN ('admin', 'instructor')
    )
  );

DROP POLICY IF EXISTS "course_group_items_update_policy" ON course_group_items;
CREATE POLICY "course_group_items_update_policy" ON course_group_items
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM user_profiles
      WHERE role IN ('admin', 'instructor')
    )
  );

DROP POLICY IF EXISTS "course_group_items_delete_policy" ON course_group_items;
CREATE POLICY "course_group_items_delete_policy" ON course_group_items
  FOR DELETE USING (
    auth.uid() IN (
      SELECT id FROM user_profiles
      WHERE role IN ('admin', 'instructor')
    )
  );
`;

    return NextResponse.json({
      success: false,
      message: 'Supabase管理画面でSQLエディタを開き、以下のSQLを実行してください',
      sql: sqlScript,
      instructions: [
        '1. Supabase管理画面にログイン',
        '2. プロジェクトを選択',
        '3. 左メニューから「SQL Editor」を選択',
        '4. 「New query」をクリック',
        '5. 上記のSQLをコピー&ペースト',
        '6. 「Run」をクリックして実行',
        '7. 実行後、このAPIを再度呼び出して確認'
      ]
    });

  } catch (error: any) {
    console.error('テーブル作成エラー:', error);
    return NextResponse.json(
      {
        error: 'テーブルの作成に失敗しました',
        details: error?.message || error
      },
      { status: 500 }
    );
  }
}
