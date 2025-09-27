import { NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const supabase = createServerComponentClient({ cookies });

    // chaptersテーブルを作成
    const { error: createTableError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS chapters (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          display_order INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- インデックスを作成
        CREATE INDEX IF NOT EXISTS idx_chapters_course_id ON chapters(course_id);
        CREATE INDEX IF NOT EXISTS idx_chapters_display_order ON chapters(display_order);

        -- RLSポリシーを設定
        ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;

        -- 全ユーザーが読み取り可能
        CREATE POLICY "Enable read access for all users" ON chapters
          FOR SELECT USING (true);

        -- 管理者とインストラクターのみ作成・更新・削除可能
        CREATE POLICY "Enable insert for admin and instructors" ON chapters
          FOR INSERT WITH CHECK (
            EXISTS (
              SELECT 1 FROM profiles
              WHERE profiles.id = auth.uid()
              AND profiles.role IN ('admin', 'instructor')
            )
          );

        CREATE POLICY "Enable update for admin and instructors" ON chapters
          FOR UPDATE USING (
            EXISTS (
              SELECT 1 FROM profiles
              WHERE profiles.id = auth.uid()
              AND profiles.role IN ('admin', 'instructor')
            )
          );

        CREATE POLICY "Enable delete for admin and instructors" ON chapters
          FOR DELETE USING (
            EXISTS (
              SELECT 1 FROM profiles
              WHERE profiles.id = auth.uid()
              AND profiles.role IN ('admin', 'instructor')
            )
          );

        -- videosテーブルに chapter_id カラムを追加
        ALTER TABLE videos
        ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL;

        -- インデックスを作成
        CREATE INDEX IF NOT EXISTS idx_videos_chapter_id ON videos(chapter_id);
      `
    });

    if (createTableError) {
      console.error('Error creating chapters table:', createTableError);
      return NextResponse.json(
        { error: 'Failed to create chapters table', details: createTableError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Chapters table created successfully'
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}