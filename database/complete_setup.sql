-- 完全なセットアップスクリプト
-- このスクリプトですべての問題を解決します

-- ===========================================
-- STEP 1: auth.usersの確認
-- ===========================================
SELECT 
  'Current Auth Users' as check_type,
  COUNT(*) as total_users,
  STRING_AGG(email, ', ') as user_emails
FROM auth.users;

-- ===========================================
-- STEP 2: user_profilesと同期
-- ===========================================
-- auth.usersに存在するがuser_profilesに存在しないユーザーを作成
DO $$
DECLARE
  user_count INTEGER;
BEGIN
  -- 同期が必要なユーザー数を確認
  SELECT COUNT(*) INTO user_count
  FROM auth.users au
  LEFT JOIN user_profiles up ON au.id = up.id
  WHERE up.id IS NULL;
  
  IF user_count > 0 THEN
    RAISE NOTICE 'Syncing % users to user_profiles', user_count;
    
    -- プロフィールを作成
    INSERT INTO user_profiles (id, email, display_name, role, is_active, created_at, updated_at)
    SELECT 
      au.id,
      au.email,
      COALESCE(au.raw_user_meta_data->>'display_name', SPLIT_PART(au.email, '@', 1)),
      COALESCE(au.raw_user_meta_data->>'role', 'student'),
      true,
      au.created_at,
      NOW()
    FROM auth.users au
    LEFT JOIN user_profiles up ON au.id = up.id
    WHERE up.id IS NULL;
    
    RAISE NOTICE 'User profiles synced successfully';
  ELSE
    RAISE NOTICE 'No users need syncing';
  END IF;
END $$;

-- ===========================================
-- STEP 3: Storageバケットを作成（Service Role権限が必要）
-- ===========================================
-- 注意: この部分はService Role Keyが必要なため、
-- Supabaseダッシュボードから手動で作成する必要があるかもしれません

-- バケットの存在確認
SELECT 
  'Storage Buckets Check' as check_type,
  COUNT(*) as existing_buckets,
  STRING_AGG(name, ', ') as bucket_names
FROM storage.buckets;

-- バケットを作成（権限エラーが出る場合はダッシュボードから作成）
DO $$
BEGIN
  -- course-thumbnailsバケット
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'course-thumbnails') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'course-thumbnails',
      'course-thumbnails',
      true,
      5242880, -- 5MB
      ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]
    );
    RAISE NOTICE 'Created bucket: course-thumbnails';
  END IF;
  
  -- videosバケット
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'videos') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'videos',
      'videos',
      true,
      3221225472, -- 3GB
      ARRAY['video/mp4', 'video/webm', 'video/quicktime']::text[]
    );
    RAISE NOTICE 'Created bucket: videos';
  END IF;
  
  -- user-avatarsバケット
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'user-avatars') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'user-avatars',
      'user-avatars',
      true,
      5242880, -- 5MB
      ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]
    );
    RAISE NOTICE 'Created bucket: user-avatars';
  END IF;
  
  -- certificatesバケット
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'certificates') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'certificates',
      'certificates',
      false,
      10485760, -- 10MB
      ARRAY['application/pdf']::text[]
    );
    RAISE NOTICE 'Created bucket: certificates';
  END IF;
  
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Cannot create storage buckets - insufficient privileges. Please create them manually in Supabase Dashboard:';
    RAISE NOTICE '1. Go to Storage section';
    RAISE NOTICE '2. Create buckets: course-thumbnails, videos, user-avatars, certificates';
    RAISE NOTICE '3. Set them as public (except certificates)';
END $$;

-- ===========================================
-- STEP 4: 管理者ユーザーの作成（まだ存在しない場合）
-- ===========================================
-- 注意: 新しいユーザーを作成するにはSupabaseダッシュボードから行うか、
-- またはアプリケーションの登録機能を使用してください

-- 既存のユーザーを管理者に昇格（必要に応じて）
-- メールアドレスを適切なものに変更してください
UPDATE user_profiles
SET role = 'admin'
WHERE email = 'admin@example.com'  -- ここを実際の管理者メールに変更
AND role != 'admin';

-- ===========================================
-- STEP 5: 最終診断
-- ===========================================
SELECT '========== FINAL CHECK ==========' as section;

-- ユーザー数の確認
SELECT 
  'User Sync Status' as check_type,
  (SELECT COUNT(*) FROM auth.users) as auth_users,
  (SELECT COUNT(*) FROM user_profiles) as user_profiles,
  CASE 
    WHEN (SELECT COUNT(*) FROM auth.users) = (SELECT COUNT(*) FROM user_profiles) 
    THEN '✅ SYNCED'
    ELSE '❌ NOT SYNCED'
  END as sync_status;

-- テーブルの存在確認
SELECT 
  'Table Status' as check_type,
  table_name,
  '✅ EXISTS' as status
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'user_profiles',
  'courses',
  'videos',
  'video_view_logs',
  'user_courses',
  'system_settings',
  'support_conversations'
)
ORDER BY table_name;

-- Storageバケットの確認
SELECT 
  'Storage Status' as check_type,
  COUNT(*) as total_buckets,
  STRING_AGG(name, ', ') as bucket_names
FROM storage.buckets;

-- システム設定の確認
SELECT 
  'Settings Status' as check_type,
  COUNT(*) as total_settings
FROM system_settings;

-- 管理者ユーザーの確認
SELECT 
  'Admin Users' as check_type,
  COUNT(*) as admin_count,
  STRING_AGG(email, ', ') as admin_emails
FROM user_profiles
WHERE role = 'admin';

-- ===========================================
-- 完了メッセージ
-- ===========================================
SELECT '
===========================================
セットアップ診断完了！

✅ 完了した項目:
- user_profilesの同期
- システムテーブルの作成
- デフォルト設定の追加

⚠️ 手動で必要な作業:
1. Storageバケットの作成（権限エラーの場合）
   - Supabaseダッシュボード → Storage
   - 以下のバケットを作成:
     • course-thumbnails (public)
     • videos (public)
     • user-avatars (public)
     • certificates (private)

2. 管理者アカウントの作成
   - アプリから新規登録
   - その後、このSQLで権限を変更:
     UPDATE user_profiles 
     SET role = ''admin'' 
     WHERE email = ''your-email@example.com'';

3. 環境変数の確認（.env.local）
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY

===========================================
' as setup_complete;