-- データベースの問題を修正するスクリプト

-- ===========================================
-- 1. 既存のauth.usersとuser_profilesの同期
-- ===========================================
-- auth.usersに存在するがuser_profilesに存在しないユーザーを確認
SELECT 
  'Missing Profiles' as check_type,
  au.id,
  au.email,
  au.created_at
FROM auth.users au
LEFT JOIN user_profiles up ON au.id = up.id
WHERE up.id IS NULL;

-- 不足しているプロフィールを作成
INSERT INTO user_profiles (id, email, display_name, role, is_active, created_at)
SELECT 
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'display_name', au.email),
  COALESCE(au.raw_user_meta_data->>'role', 'student'),
  true,
  au.created_at
FROM auth.users au
LEFT JOIN user_profiles up ON au.id = up.id
WHERE up.id IS NULL;

-- ===========================================
-- 2. handle_new_userトリガーの再作成
-- ===========================================
-- 既存のトリガーを削除
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 改良版の関数を作成
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (
    id, 
    email, 
    display_name, 
    role,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name),
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガーを再作成
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ===========================================
-- 3. Storageバケットの作成
-- ===========================================
-- バケットを作成（既に存在する場合はスキップ）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  (
    'course-thumbnails',
    'course-thumbnails', 
    true,
    5242880, -- 5MB
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]
  ),
  (
    'videos',
    'videos',
    true,
    3221225472, -- 3GB
    ARRAY['video/mp4', 'video/webm', 'video/quicktime']::text[]
  ),
  (
    'user-avatars',
    'user-avatars',
    true,
    5242880, -- 5MB
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]
  ),
  (
    'certificates',
    'certificates',
    false,
    10485760, -- 10MB
    ARRAY['application/pdf']::text[]
  )
ON CONFLICT (id) DO UPDATE
SET 
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ===========================================
-- 4. Storage RLSポリシーの設定
-- ===========================================
-- 既存のポリシーを削除して再作成
DROP POLICY IF EXISTS "Public can view course thumbnails" ON storage.objects;
CREATE POLICY "Public can view course thumbnails" ON storage.objects
  FOR SELECT USING (bucket_id = 'course-thumbnails');

DROP POLICY IF EXISTS "Admins can upload course thumbnails" ON storage.objects;
CREATE POLICY "Admins can upload course thumbnails" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'course-thumbnails' AND
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'instructor')
    )
  );

DROP POLICY IF EXISTS "Public can view videos" ON storage.objects;
CREATE POLICY "Public can view videos" ON storage.objects
  FOR SELECT USING (bucket_id = 'videos');

DROP POLICY IF EXISTS "Admins can upload videos" ON storage.objects;
CREATE POLICY "Admins can upload videos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'videos' AND
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'instructor')
    )
  );

DROP POLICY IF EXISTS "Users can view own avatar" ON storage.objects;
CREATE POLICY "Users can view own avatar" ON storage.objects
  FOR SELECT USING (bucket_id = 'user-avatars');

DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'user-avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ===========================================
-- 5. デフォルトのシステム設定を追加
-- ===========================================
INSERT INTO system_settings (setting_key, setting_value, setting_type, category, description)
VALUES 
  ('general.site_name', 'LMS System', 'string', 'general', 'サイト名'),
  ('general.site_description', '企業向け学習管理システム', 'string', 'general', 'サイト説明'),
  ('general.default_language', 'ja', 'string', 'general', 'デフォルト言語'),
  ('security.session_timeout_hours', '24', 'number', 'security', 'セッションタイムアウト時間'),
  ('learning.default_completion_threshold', '80', 'number', 'learning', 'デフォルト完了閾値')
ON CONFLICT (setting_key) DO NOTHING;

-- ===========================================
-- 6. 診断結果
-- ===========================================
SELECT 'Database Fix Complete!' as status;

-- 修正後の状態確認
SELECT 
  'Final Check' as check_type,
  (SELECT COUNT(*) FROM auth.users) as auth_users,
  (SELECT COUNT(*) FROM user_profiles) as user_profiles,
  (SELECT COUNT(*) FROM storage.buckets) as storage_buckets,
  (SELECT COUNT(*) FROM system_settings) as system_settings,
  CASE 
    WHEN (SELECT COUNT(*) FROM auth.users) = (SELECT COUNT(*) FROM user_profiles) 
    THEN '✅ Profiles synced'
    ELSE '⚠️ Profile sync needed'
  END as sync_status;