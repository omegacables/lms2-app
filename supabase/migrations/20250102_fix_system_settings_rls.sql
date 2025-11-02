-- system_settingsテーブルのRLSポリシーを修正
-- メンテナンスモードの確認のため、anonロールでも読み取りを許可

-- 既存のRLSポリシーを削除
DROP POLICY IF EXISTS "Allow anonymous read for maintenance check" ON system_settings;
DROP POLICY IF EXISTS "Allow public read" ON system_settings;

-- 新しいRLSポリシーを作成: 匿名ユーザーでも読み取り可能
CREATE POLICY "Allow anonymous read for maintenance check"
ON system_settings
FOR SELECT
TO anon, authenticated
USING (true);

-- 管理者のみが更新・挿入・削除可能
DROP POLICY IF EXISTS "Allow admin write" ON system_settings;
CREATE POLICY "Allow admin write"
ON system_settings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role = 'admin'
  )
);
