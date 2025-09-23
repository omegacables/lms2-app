-- videosテーブルのRLSポリシーを修正
-- Supabase SQL Editorで実行してください

-- 1. 現在のRLSポリシーを確認
SELECT * FROM pg_policies WHERE tablename = 'videos';

-- 2. RLSを一時的に無効化（開発環境用）
ALTER TABLE videos DISABLE ROW LEVEL SECURITY;

-- または、適切なポリシーを作成（推奨）
-- 既存のポリシーを削除
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON videos;
DROP POLICY IF EXISTS "Enable read for all users" ON videos;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON videos;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON videos;

-- RLSを有効化
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

-- 新しいポリシーを作成
-- 認証済みユーザーは全ての操作が可能
CREATE POLICY "Authenticated users can insert videos"
ON videos FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Anyone can view videos"
ON videos FOR SELECT
TO public
USING (true);

CREATE POLICY "Authenticated users can update videos"
ON videos FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete videos"
ON videos FOR DELETE
TO authenticated
USING (true);

-- 3. ポリシーが適用されたことを確認
SELECT * FROM pg_policies WHERE tablename = 'videos';