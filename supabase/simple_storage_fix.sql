-- シンプルなストレージRLS修正
-- これをSupabaseのSQL Editorで実行してください

-- 1. RLSを有効化
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 2. 全ての古いポリシーを削除（videosバケット関連）
DO $$
BEGIN
    -- エラーを無視して実行
    DROP POLICY IF EXISTS "Public Access" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can update" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;
EXCEPTION
    WHEN OTHERS THEN
        NULL; -- エラーを無視
END $$;

-- 3. シンプルなポリシーを作成：認証済みユーザーは全て可能
CREATE POLICY "Anyone can view videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'videos');

CREATE POLICY "Authenticated can upload videos"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'videos'
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated can update videos"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'videos'
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated can delete videos"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'videos'
    AND auth.role() = 'authenticated'
);

-- 4. バケットを公開に設定
UPDATE storage.buckets
SET public = true
WHERE id = 'videos';

-- 5. 結果を確認
SELECT 'Storage RLS policies have been updated successfully!' as message;