-- ================================
-- videosテーブルに必要なカラムを追加
-- ================================

-- 1. 現在のカラムを確認（読み取りのみ）
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'videos'
ORDER BY ordinal_position;

-- 2. 必要なカラムを追加（既に存在する場合はスキップ）
ALTER TABLE videos
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS file_path TEXT,
ADD COLUMN IF NOT EXISTS file_size BIGINT,
ADD COLUMN IF NOT EXISTS mime_type TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 3. 既存のurlカラムのデータをfile_urlに移行（データがある場合）
DO $$
BEGIN
  -- urlカラムが存在し、file_urlが空の場合のみデータを移行
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'videos' AND column_name = 'url') THEN
    UPDATE videos
    SET file_url = url
    WHERE file_url IS NULL AND url IS NOT NULL;

    -- file_pathも設定
    UPDATE videos
    SET file_path = url
    WHERE file_path IS NULL AND url IS NOT NULL;
  END IF;
END $$;

-- 4. 追加後のカラムを確認
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'videos'
ORDER BY ordinal_position;

-- 5. videosテーブルのサンプルデータを確認（最初の1件）
SELECT * FROM videos LIMIT 1;

-- ================================
-- 注意：このスクリプトはデータを削除しません
-- 既存のデータは保持され、新しいカラムが追加されるだけです
-- ================================