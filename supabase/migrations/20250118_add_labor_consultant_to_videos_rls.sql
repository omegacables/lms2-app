-- videosテーブルのRLSポリシーを更新
-- 社労士事務所（labor_consultant）も非公開動画を含む全動画を閲覧可能にする

-- 既存の読み取りポリシーを削除
DROP POLICY IF EXISTS "Allow authenticated users to read active videos" ON videos;

-- 新しい読み取りポリシー: 認証済みユーザーは公開動画を閲覧可能、
-- 管理者/講師/社労士事務所は全て閲覧可能
CREATE POLICY "Allow authenticated users to read active videos"
ON videos
FOR SELECT
TO authenticated
USING (
  status = 'active' OR
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('admin', 'instructor', 'labor_consultant')
  )
);
