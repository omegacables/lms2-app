-- ================================
-- 安全な確認用SQL（データは一切削除しません）
-- ================================

-- 1. 現在のストレージバケットを確認（読み取りのみ）
SELECT
  id,
  name,
  public,
  file_size_limit,
  file_size_limit / 1024 / 1024 as file_size_mb,
  file_size_limit / 1024 / 1024 / 1024 as file_size_gb,
  allowed_mime_types,
  created_at
FROM storage.buckets
WHERE name = 'videos';

-- 2. videosテーブルの構造を確認（読み取りのみ）
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'videos'
ORDER BY ordinal_position;

-- 3. 現在のRLSポリシーを確認（読み取りのみ）
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('videos', 'objects')
  AND schemaname IN ('public', 'storage')
ORDER BY tablename, policyname;

-- 4. 現在の動画データ数を確認（読み取りのみ）
SELECT
  COUNT(*) as total_videos,
  COUNT(DISTINCT course_id) as total_courses
FROM videos;

-- 5. バケットが存在しない場合のみ作成する安全なSQL
-- これだけは実行時に新規作成する可能性があります
-- ※既存のバケットがあれば何もしません
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE name = 'videos') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'videos',
      'videos',
      true,
      3221225472, -- 3GB
      ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
    );
    RAISE NOTICE 'videosバケットを作成しました';
  ELSE
    RAISE NOTICE 'videosバケットは既に存在します';
  END IF;
END $$;