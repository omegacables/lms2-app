import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const { supabase, error: authError, status } = await createAdminClient();

    if (authError || !supabase) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: status || 401 });
    }

    // チャプターテーブルを作成
    const queries = [
      // 既存のテーブルがあれば削除
      `DROP TABLE IF EXISTS chapter_videos CASCADE`,
      `DROP TABLE IF EXISTS chapters CASCADE`,

      // chaptersテーブルの作成
      `CREATE TABLE IF NOT EXISTS chapters (
        id SERIAL PRIMARY KEY,
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,

      // chapter_videos中間テーブルの作成
      `CREATE TABLE IF NOT EXISTS chapter_videos (
        id SERIAL PRIMARY KEY,
        chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
        video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(chapter_id, video_id)
      )`,

      // インデックスの作成
      `CREATE INDEX IF NOT EXISTS idx_chapters_course_id ON chapters(course_id)`,
      `CREATE INDEX IF NOT EXISTS idx_chapters_display_order ON chapters(display_order)`,
      `CREATE INDEX IF NOT EXISTS idx_chapter_videos_chapter_id ON chapter_videos(chapter_id)`,
      `CREATE INDEX IF NOT EXISTS idx_chapter_videos_video_id ON chapter_videos(video_id)`,

      // RLSポリシーの有効化
      `ALTER TABLE chapters ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE chapter_videos ENABLE ROW LEVEL SECURITY`,
    ];

    // RLSポリシーの作成
    const policies = [
      // 読み取りポリシー
      `CREATE POLICY "chapters_read_all" ON chapters FOR SELECT USING (true)`,
      `CREATE POLICY "chapter_videos_read_all" ON chapter_videos FOR SELECT USING (true)`,

      // 認証ユーザー用のポリシー
      `CREATE POLICY "chapters_insert_authenticated" ON chapters FOR INSERT TO authenticated WITH CHECK (true)`,
      `CREATE POLICY "chapters_update_authenticated" ON chapters FOR UPDATE TO authenticated USING (true) WITH CHECK (true)`,
      `CREATE POLICY "chapters_delete_authenticated" ON chapters FOR DELETE TO authenticated USING (true)`,
      `CREATE POLICY "chapter_videos_insert_authenticated" ON chapter_videos FOR INSERT TO authenticated WITH CHECK (true)`,
      `CREATE POLICY "chapter_videos_update_authenticated" ON chapter_videos FOR UPDATE TO authenticated USING (true) WITH CHECK (true)`,
      `CREATE POLICY "chapter_videos_delete_authenticated" ON chapter_videos FOR DELETE TO authenticated USING (true)`,
    ];

    const results = [];
    const errors = [];

    // テーブル作成クエリを実行
    for (const query of queries) {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: query });
        if (error) {
          errors.push({ query: query.substring(0, 50), error: error.message });
        } else {
          results.push({ query: query.substring(0, 50), status: 'success' });
        }
      } catch (e) {
        errors.push({ query: query.substring(0, 50), error: String(e) });
      }
    }

    // ポリシー作成（エラーを無視 - 既に存在する場合があるため）
    for (const policy of policies) {
      try {
        await supabase.rpc('exec_sql', { sql: policy });
      } catch (e) {
        // ポリシーが既に存在する場合のエラーは無視
      }
    }

    // テーブルの存在を確認
    const { data: tables, error: checkError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .in('table_name', ['chapters', 'chapter_videos'])
      .eq('table_schema', 'public');

    return NextResponse.json({
      success: errors.length === 0,
      message: errors.length === 0
        ? 'チャプターテーブルが正常に作成されました'
        : 'テーブル作成中に一部エラーが発生しました',
      results,
      errors,
      tablesCreated: tables?.map(t => t.table_name) || [],
      instruction: errors.length > 0
        ? 'Supabaseの管理画面でSQLエディタを開き、create-chapters-table.sqlの内容を実行してください'
        : null
    });

  } catch (error) {
    console.error('Error creating chapters tables:', error);
    return NextResponse.json({
      error: 'テーブル作成に失敗しました',
      details: error instanceof Error ? error.message : 'Unknown error',
      instruction: 'Supabaseの管理画面でSQLエディタから直接SQLを実行してください'
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { supabase, error: authError } = await createAdminClient();

    if (authError || !supabase) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
    }

    // テーブルの存在を確認
    const { data: chapters } = await supabase.from('chapters').select('*').limit(1);
    const { data: chapterVideos } = await supabase.from('chapter_videos').select('*').limit(1);

    return NextResponse.json({
      chaptersTableExists: chapters !== null,
      chapterVideosTableExists: chapterVideos !== null,
      message: 'テーブル状態を確認しました'
    });
  } catch (error) {
    return NextResponse.json({
      chaptersTableExists: false,
      chapterVideosTableExists: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}