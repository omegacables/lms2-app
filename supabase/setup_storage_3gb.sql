-- ================================
-- Supabase Storage Setup for 3GB Video Upload
-- ================================

-- 1. ストレージバケットの作成（存在しない場合）
-- ================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos',
  'videos',
  true,
  3221225472, -- 3GB in bytes
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = 3221225472,
  allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];

-- 2. 既存のRLSポリシーを削除
-- ================================
DROP POLICY IF EXISTS "Allow authenticated users to upload" ON storage.objects;
DROP POLICY IF EXISTS "Allow public to view videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated to upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated to update own videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated to delete own videos" ON storage.objects;

-- 3. 新しいRLSポリシーを作成
-- ================================

-- 認証済みユーザーがvideoバケットにアップロードできる
CREATE POLICY "Authenticated users can upload videos" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'videos'
);

-- 認証済みユーザーが自分のアップロードした動画を更新できる
CREATE POLICY "Users can update own videos" ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'videos' AND
  auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'videos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 認証済みユーザーが自分のアップロードした動画を削除できる
CREATE POLICY "Users can delete own videos" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'videos'
);

-- 全員が動画を閲覧できる（publicバケットのため）
CREATE POLICY "Public can view videos" ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'videos');

-- 4. videosテーブルのカラムを確認・追加
-- ================================
ALTER TABLE videos
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS file_path TEXT,
ADD COLUMN IF NOT EXISTS file_size BIGINT,
ADD COLUMN IF NOT EXISTS mime_type TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 古いurlカラムがある場合はfile_urlにマイグレート
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'videos' AND column_name = 'url') THEN
    UPDATE videos SET file_url = url WHERE file_url IS NULL AND url IS NOT NULL;
  END IF;
END $$;

-- 5. videosテーブルのRLSポリシー
-- ================================

-- RLSを有効化
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "Public videos are viewable by everyone" ON videos;
DROP POLICY IF EXISTS "Authenticated users can create videos" ON videos;
DROP POLICY IF EXISTS "Authenticated users can update videos" ON videos;
DROP POLICY IF EXISTS "Authenticated users can delete videos" ON videos;

-- 全員が公開動画を見られる
CREATE POLICY "Public can view active videos" ON videos
FOR SELECT
TO public
USING (status = 'active');

-- 管理者とインストラクターが動画を作成できる
CREATE POLICY "Admin and instructors can create videos" ON videos
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'instructor')
  )
);

-- 管理者とインストラクターが動画を更新できる
CREATE POLICY "Admin and instructors can update videos" ON videos
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'instructor')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'instructor')
  )
);

-- 管理者が動画を削除できる
CREATE POLICY "Admin can delete videos" ON videos
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);

-- 6. ストレージ設定の確認
-- ================================
SELECT
  id,
  name,
  public,
  file_size_limit / 1024 / 1024 / 1024 as file_size_limit_gb,
  allowed_mime_types
FROM storage.buckets
WHERE id = 'videos';

-- 7. RLSポリシーの確認
-- ================================
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('videos', 'objects')
ORDER BY tablename, policyname;

-- ================================
-- 実行後の確認事項
-- ================================
-- 1. Supabaseダッシュボードでバケット設定を確認
-- 2. RLSが正しく設定されていることを確認
-- 3. テストユーザーでアップロードテストを実施