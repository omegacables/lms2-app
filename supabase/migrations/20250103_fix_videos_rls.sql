-- videosテーブルのRLSポリシーを修正
-- 管理者と講師が動画のステータスを含むすべてのフィールドを更新できるようにする

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "Allow authenticated read" ON videos;
DROP POLICY IF EXISTS "Allow public read active videos" ON videos;
DROP POLICY IF EXISTS "Allow admin and instructor insert" ON videos;
DROP POLICY IF EXISTS "Allow admin and instructor update" ON videos;
DROP POLICY IF EXISTS "Allow admin and instructor delete" ON videos;

-- RLSを有効化
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

-- 読み取りポリシー: 認証済みユーザーは公開動画を閲覧可能、管理者/講師は全て閲覧可能
CREATE POLICY "Allow authenticated users to read active videos"
ON videos
FOR SELECT
TO authenticated
USING (
  status = 'active' OR
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('admin', 'instructor')
  )
);

-- 挿入ポリシー: 管理者と講師のみ
CREATE POLICY "Allow admin and instructor to insert videos"
ON videos
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('admin', 'instructor')
  )
);

-- 更新ポリシー: 管理者と講師のみ（statusフィールドを含む全てのフィールド）
CREATE POLICY "Allow admin and instructor to update videos"
ON videos
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('admin', 'instructor')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('admin', 'instructor')
  )
);

-- 削除ポリシー: 管理者と講師のみ
CREATE POLICY "Allow admin and instructor to delete videos"
ON videos
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('admin', 'instructor')
  )
);
