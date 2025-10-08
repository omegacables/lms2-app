-- 管理者が他のユーザーの学習ログを追加・更新できるポリシーを追加
-- 実行方法: Supabase Dashboard > SQL Editor で実行

-- 1. 管理者がINSERTできるポリシーを追加
DROP POLICY IF EXISTS "Admins can insert all progress" ON video_view_logs;
CREATE POLICY "Admins can insert all progress" ON video_view_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 2. 管理者がUPDATEできるポリシーを追加
DROP POLICY IF EXISTS "Admins can update all progress" ON video_view_logs;
CREATE POLICY "Admins can update all progress" ON video_view_logs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 3. 現在のポリシーを確認
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
WHERE tablename = 'video_view_logs'
ORDER BY policyname;
