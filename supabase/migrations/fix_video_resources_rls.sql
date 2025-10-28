-- video_resources のRLSポリシーを修正
-- より明示的なポリシーに分割

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "Anyone can view video resources" ON video_resources;
DROP POLICY IF EXISTS "Admin and instructors can manage resources" ON video_resources;

-- SELECT用ポリシー: 認証済みユーザーは全て閲覧可能
CREATE POLICY "Authenticated users can view video resources" ON video_resources
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT用ポリシー: 管理者とインストラクターのみ
CREATE POLICY "Admin and instructors can insert resources" ON video_resources
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'instructor')
    )
  );

-- UPDATE用ポリシー: 管理者とインストラクターのみ
CREATE POLICY "Admin and instructors can update resources" ON video_resources
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

-- DELETE用ポリシー: 管理者とインストラクターのみ
CREATE POLICY "Admin and instructors can delete resources" ON video_resources
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'instructor')
    )
  );
