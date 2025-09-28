-- チャプターテーブルの作成
-- 既存のmetadata方式から独立したテーブルベースの実装に変更

-- 既存のテーブルがあれば削除（開発用）
DROP TABLE IF EXISTS chapter_videos CASCADE;
DROP TABLE IF EXISTS chapters CASCADE;

-- chaptersテーブルの作成
CREATE TABLE chapters (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- chapter_videos中間テーブルの作成（チャプターと動画の多対多関係）
CREATE TABLE chapter_videos (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(chapter_id, video_id)
);

-- インデックスの作成
CREATE INDEX idx_chapters_course_id ON chapters(course_id);
CREATE INDEX idx_chapters_display_order ON chapters(display_order);
CREATE INDEX idx_chapter_videos_chapter_id ON chapter_videos(chapter_id);
CREATE INDEX idx_chapter_videos_video_id ON chapter_videos(video_id);

-- RLSポリシー
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapter_videos ENABLE ROW LEVEL SECURITY;

-- 全ユーザーが読み取り可能
CREATE POLICY "chapters_read_all" ON chapters
  FOR SELECT
  USING (true);

CREATE POLICY "chapter_videos_read_all" ON chapter_videos
  FOR SELECT
  USING (true);

-- 認証ユーザーのみ作成・更新・削除可能
CREATE POLICY "chapters_insert_authenticated" ON chapters
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "chapters_update_authenticated" ON chapters
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "chapters_delete_authenticated" ON chapters
  FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "chapter_videos_insert_authenticated" ON chapter_videos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "chapter_videos_update_authenticated" ON chapter_videos
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "chapter_videos_delete_authenticated" ON chapter_videos
  FOR DELETE
  TO authenticated
  USING (true);