-- 特定のユーザーのロールを管理者に更新するSQL
-- 使用方法: Supabase SQL Editorで実行

-- 全ユーザーのロールを確認
SELECT
    up.id,
    up.email,
    up.display_name,
    up.role,
    up.created_at
FROM user_profiles up
ORDER BY up.created_at DESC;

-- 特定のemailを持つユーザーのロールを管理者に更新
-- 例: admin@example.com を admin に変更
UPDATE user_profiles
SET
    role = 'admin',
    updated_at = CURRENT_TIMESTAMP
WHERE email = 'admin@example.com';  -- ここに実際のメールアドレスを入力

-- または、最初のユーザーを管理者にする場合
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

-- 変更後の確認
SELECT
    up.id,
    up.email,
    up.display_name,
    up.role,
    up.updated_at
FROM user_profiles up
WHERE role IN ('admin', 'instructor')
ORDER BY up.updated_at DESC;