-- ユーザーロールを管理者に更新するSQL
-- Supabase SQL Editorで以下を順番に実行してください

-- 1. まず全ユーザーのロールを確認（正しいカラム名を使用）
SELECT
    id,
    email,
    display_name,
    role,
    created_at
FROM user_profiles
ORDER BY created_at DESC;

-- 2. 特定のメールアドレスのユーザーを管理者に更新
-- 'your-email@example.com' を実際のメールアドレスに置き換えてください
UPDATE user_profiles
SET
    role = 'admin',
    updated_at = CURRENT_TIMESTAMP
WHERE email = 'your-email@example.com';

-- 3. または、最初に作成されたユーザーを管理者にする場合
UPDATE user_profiles
SET
    role = 'admin',
    updated_at = CURRENT_TIMESTAMP
WHERE id = (
    SELECT id
    FROM user_profiles
    ORDER BY created_at
    LIMIT 1
);

-- 4. 変更後の確認
SELECT
    id,
    email,
    display_name,
    role,
    updated_at
FROM user_profiles
WHERE role IN ('admin', 'instructor')
ORDER BY updated_at DESC;