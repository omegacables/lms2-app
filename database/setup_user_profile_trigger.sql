-- ユーザープロファイルを自動作成するトリガー
-- Supabase SQL Editorで実行してください

-- 1. まず既存のユーザープロファイルを作成（既存ユーザー用）
INSERT INTO user_profiles (
    id,
    email,
    display_name,
    role,
    is_active,
    created_at,
    updated_at
)
SELECT
    id,
    email,
    COALESCE(raw_user_meta_data->>'display_name', email),
    'admin', -- 最初のユーザーは管理者として設定
    true,
    created_at,
    NOW()
FROM auth.users
WHERE id NOT IN (SELECT id FROM user_profiles)
LIMIT 1;

-- 残りのユーザーを学生として追加
INSERT INTO user_profiles (
    id,
    email,
    display_name,
    role,
    is_active,
    created_at,
    updated_at
)
SELECT
    id,
    email,
    COALESCE(raw_user_meta_data->>'display_name', email),
    'student',
    true,
    created_at,
    NOW()
FROM auth.users
WHERE id NOT IN (SELECT id FROM user_profiles);

-- 2. 新規ユーザー登録時に自動的にプロファイルを作成する関数
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (
    id,
    email,
    display_name,
    role,
    is_active
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'display_name', new.email),
    'student', -- 新規ユーザーはデフォルトで学生
    true
  );
  RETURN new;
END;
$$;

-- 3. 既存のトリガーがあれば削除
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 4. トリガーを作成
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. 現在のユーザープロファイルを確認
SELECT
    up.id,
    up.email,
    up.display_name,
    up.role,
    up.is_active,
    up.created_at
FROM user_profiles up
ORDER BY up.created_at DESC;

-- 6. 特定のユーザーを管理者に更新（メールアドレスを変更してください）
UPDATE user_profiles
SET
    role = 'admin',
    updated_at = NOW()
WHERE email = 'resident.3renren@gmail.com';