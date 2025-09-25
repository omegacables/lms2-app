-- ストレージのRLSポリシーを修正
-- videosバケットのポリシーを設定

-- 1. 既存のポリシーを確認
SELECT * FROM storage.policies WHERE bucket_id = 'videos';

-- 2. 既存のポリシーを削除（必要に応じて）
-- DELETE FROM storage.policies WHERE bucket_id = 'videos';

-- 3. 新しいポリシーを作成

-- 認証済みユーザーは動画を表示できる
CREATE POLICY "Allow authenticated users to view videos" ON storage.objects
FOR SELECT USING (
    bucket_id = 'videos'
    AND auth.role() = 'authenticated'
);

-- 管理者とインストラクターは動画をアップロードできる
CREATE POLICY "Allow admin/instructor to upload videos" ON storage.objects
FOR INSERT WITH CHECK (
    bucket_id = 'videos'
    AND auth.role() = 'authenticated'
    AND (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'instructor')
        )
        OR auth.jwt() ->> 'role' = 'service_role'  -- Service Roleキーを使用する場合
    )
);

-- 管理者とインストラクターは動画を更新できる
CREATE POLICY "Allow admin/instructor to update videos" ON storage.objects
FOR UPDATE USING (
    bucket_id = 'videos'
    AND auth.role() = 'authenticated'
    AND (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'instructor')
        )
        OR auth.jwt() ->> 'role' = 'service_role'
    )
);

-- 管理者とインストラクターは動画を削除できる
CREATE POLICY "Allow admin/instructor to delete videos" ON storage.objects
FOR DELETE USING (
    bucket_id = 'videos'
    AND auth.role() = 'authenticated'
    AND (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'instructor')
        )
        OR auth.jwt() ->> 'role' = 'service_role'
    )
);

-- Service Roleキーは全ての操作が可能
CREATE POLICY "Service role can do anything" ON storage.objects
FOR ALL USING (
    auth.jwt() ->> 'role' = 'service_role'
);

-- バケットの公開設定を確認
UPDATE storage.buckets
SET public = true
WHERE id = 'videos';

-- 現在のポリシーを確認
SELECT * FROM storage.policies WHERE bucket_id = 'videos';