-- ストレージのRLSポリシーを修正（修正版）
-- Supabaseの正しいシステムテーブルを使用

-- 1. 現在のRLSステータスを確認
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'storage';

-- 2. storage.objectsテーブルのRLSを有効化
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. 既存のポリシーを確認
SELECT polname, polcmd, polroles::regrole[], polqual, polwithcheck
FROM pg_policies
WHERE schemaname = 'storage'
AND tablename = 'objects';

-- 4. 既存のポリシーを削除（必要に応じて手動でコメントを外して実行）
-- DROP POLICY IF EXISTS "Allow authenticated users to view videos" ON storage.objects;
-- DROP POLICY IF EXISTS "Allow admin/instructor to upload videos" ON storage.objects;
-- DROP POLICY IF EXISTS "Allow admin/instructor to update videos" ON storage.objects;
-- DROP POLICY IF EXISTS "Allow admin/instructor to delete videos" ON storage.objects;
-- DROP POLICY IF EXISTS "Service role can do anything" ON storage.objects;
-- DROP POLICY IF EXISTS "Enable read access for all users" ON storage.objects;
-- DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON storage.objects;
-- DROP POLICY IF EXISTS "Enable update for users based on user_id" ON storage.objects;
-- DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON storage.objects;

-- 5. 公開読み取りアクセスを許可（videosバケット）
CREATE POLICY "Public Access" ON storage.objects
FOR SELECT USING (bucket_id = 'videos');

-- 6. 認証済みユーザーによるアップロードを許可
CREATE POLICY "Authenticated users can upload" ON storage.objects
FOR INSERT WITH CHECK (
    bucket_id = 'videos'
    AND auth.role() = 'authenticated'
);

-- 7. 認証済みユーザーによる更新を許可
CREATE POLICY "Authenticated users can update" ON storage.objects
FOR UPDATE USING (
    bucket_id = 'videos'
    AND auth.role() = 'authenticated'
);

-- 8. 認証済みユーザーによる削除を許可
CREATE POLICY "Authenticated users can delete" ON storage.objects
FOR DELETE USING (
    bucket_id = 'videos'
    AND auth.role() = 'authenticated'
);

-- 9. バケットの設定を確認
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'videos';

-- 10. バケットを公開に設定（必要に応じて）
UPDATE storage.buckets
SET public = true
WHERE id = 'videos';

-- 11. 最終的なポリシーを確認
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
WHERE schemaname = 'storage'
AND tablename = 'objects'
ORDER BY policyname;