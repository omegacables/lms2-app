-- 証明書テーブルのRow Level Security (RLS) ポリシーを修正
-- このSQLをSupabaseのSQL Editorで実行してください

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "Users can view their own certificates" ON certificates;
DROP POLICY IF EXISTS "Users can insert their own certificates" ON certificates;
DROP POLICY IF EXISTS "Users can update their own certificates" ON certificates;
DROP POLICY IF EXISTS "Admins can view all certificates" ON certificates;
DROP POLICY IF EXISTS "Admins can manage all certificates" ON certificates;
DROP POLICY IF EXISTS "Service role can manage all certificates" ON certificates;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON certificates;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON certificates;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON certificates;

-- RLSが無効な場合は有効化
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

-- 1. すべての認証済みユーザーが自分の証明書を見られるポリシー
CREATE POLICY "Users can view own certificates"
ON certificates
FOR SELECT
USING (
    auth.uid() = user_id
);

-- 2. 管理者がすべての証明書を見られるポリシー
CREATE POLICY "Admins can view all certificates"
ON certificates
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
);

-- 3. システムが証明書を作成できるポリシー（サービスロール用）
CREATE POLICY "System can create certificates"
ON certificates
FOR INSERT
WITH CHECK (
    -- 認証済みユーザーが自分の証明書を作成できる
    auth.uid() = user_id
    OR
    -- 管理者がすべての証明書を作成できる
    EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
);

-- 4. システムが証明書を更新できるポリシー
CREATE POLICY "System can update certificates"
ON certificates
FOR UPDATE
USING (
    -- 自分の証明書を更新できる
    auth.uid() = user_id
    OR
    -- 管理者がすべての証明書を更新できる
    EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
)
WITH CHECK (
    -- 自分の証明書を更新できる
    auth.uid() = user_id
    OR
    -- 管理者がすべての証明書を更新できる
    EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
);

-- 5. 管理者が証明書を削除できるポリシー
CREATE POLICY "Admins can delete certificates"
ON certificates
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
);

-- コーステーブルのRLSも確認（証明書ページでJOINするため）
-- コースは全員が読めるようにする
DROP POLICY IF EXISTS "Anyone can view active courses" ON courses;
CREATE POLICY "Anyone can view courses"
ON courses
FOR SELECT
USING (true);

-- user_profilesテーブルのRLSも確認
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
CREATE POLICY "Users can view profiles"
ON user_profiles
FOR SELECT
USING (
    -- 自分のプロフィールを見られる
    auth.uid() = id
    OR
    -- 管理者はすべてのプロフィールを見られる
    EXISTS (
        SELECT 1 FROM user_profiles AS up
        WHERE up.id = auth.uid()
        AND up.role = 'admin'
    )
);

-- 証明書テーブルの内容を確認
SELECT COUNT(*) AS total_certificates FROM certificates;

-- アクティブな証明書の数を確認
SELECT COUNT(*) AS active_certificates FROM certificates WHERE is_active = true;

-- ユーザー別の証明書数を確認
SELECT
    user_id,
    COUNT(*) AS certificate_count,
    MAX(created_at) AS latest_certificate
FROM certificates
GROUP BY user_id
ORDER BY certificate_count DESC;

-- 最近作成された証明書を確認
SELECT
    id,
    user_id,
    course_id,
    user_name,
    course_title,
    is_active,
    created_at
FROM certificates
ORDER BY created_at DESC
LIMIT 10;