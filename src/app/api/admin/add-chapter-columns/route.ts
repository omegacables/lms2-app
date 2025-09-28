import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminSupabaseClient();

    // videosテーブルにチャプター関連のカラムを追加
    const queries = [
      // chapter_title カラムを追加（既に存在する場合はスキップ）
      `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'videos'
            AND column_name = 'chapter_title'
          ) THEN
            ALTER TABLE videos
            ADD COLUMN chapter_title TEXT;
          END IF;
        END $$;
      `,
      // chapter_order カラムを追加（既に存在する場合はスキップ）
      `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'videos'
            AND column_name = 'chapter_order'
          ) THEN
            ALTER TABLE videos
            ADD COLUMN chapter_order INTEGER DEFAULT 0;
          END IF;
        END $$;
      `,
      // インデックスを作成
      `
        CREATE INDEX IF NOT EXISTS idx_videos_chapter_title ON videos(chapter_title);
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_videos_chapter_order ON videos(chapter_order);
      `
    ];

    const results = [];
    for (const query of queries) {
      try {
        const { error } = await supabase.rpc('exec_sql', {
          sql: query
        });

        if (error) {
          results.push({ query: query.substring(0, 50), error: error.message });
        } else {
          results.push({ query: query.substring(0, 50), success: true });
        }
      } catch (err) {
        results.push({ query: query.substring(0, 50), error: err });
      }
    }

    // coursesテーブルにdisplay_orderカラムを追加（コース並び替え用）
    const courseOrderQueries = [
      `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'courses'
            AND column_name = 'display_order'
          ) THEN
            ALTER TABLE courses
            ADD COLUMN display_order INTEGER DEFAULT 0;
          END IF;
        END $$;
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_courses_display_order ON courses(display_order);
      `
    ];

    for (const query of courseOrderQueries) {
      try {
        const { error } = await supabase.rpc('exec_sql', {
          sql: query
        });

        if (error) {
          results.push({ query: 'Course order: ' + query.substring(0, 30), error: error.message });
        } else {
          results.push({ query: 'Course order: ' + query.substring(0, 30), success: true });
        }
      } catch (err) {
        results.push({ query: 'Course order: ' + query.substring(0, 30), error: err });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Chapter columns added to videos table successfully',
      details: {
        columnsAdded: ['chapter_title', 'chapter_order'],
        coursesColumnsAdded: ['display_order'],
        results
      }
    });

  } catch (error) {
    console.error('Error adding chapter columns:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}