-- ユーザープロファイルを作成するSQL
-- Supabase SQL Editorで実行してください

-- 1. 既存のユーザープロファイルを確認
SELECT * FROM user_profiles
WHERE id = 'aa7238c3-f73f-4a8f-a8cf-46305d69c2cf';

-- 2. ユーザープロファイルが存在しない場合は作成
INSERT INTO user_profiles (
    id,
    email,
    display_name,
    role,
    is_active,
    created_at,
    updated_at
)
VALUES (
    'aa7238c3-f73f-4a8f-a8cf-46305d69c2cf',
    'resident.3renren@gmail.com',
    'Admin User',
    'admin',  -- admin権限を付与
    true,
    NOW(),
    NOW()
)
ON CONFLICT (id)
DO UPDATE SET
    role = 'admin',
    updated_at = NOW();

-- 3. 作成後の確認
SELECT * FROM user_profiles
WHERE id = 'aa7238c3-f73f-4a8f-a8cf-46305d69c2cf';