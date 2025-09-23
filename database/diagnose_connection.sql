-- Supabaseデータベース接続診断スクリプト
-- このスクリプトを実行して、データベースの状態を確認します

-- ===========================================
-- 1. 基本的なテーブルの存在確認
-- ===========================================
SELECT 
  'Table Check' as check_type,
  table_name,
  CASE 
    WHEN table_name IS NOT NULL THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'user_profiles',
  'courses', 
  'videos',
  'video_view_logs',
  'user_courses',
  'course_completions',
  'certificates',
  'system_settings',
  'system_logs',
  'support_conversations',
  'support_messages',
  'announcements',
  'notifications',
  'messages'
)
ORDER BY table_name;

-- ===========================================
-- 2. RLS（Row Level Security）の状態確認
-- ===========================================
SELECT 
  'RLS Status' as check_type,
  schemaname,
  tablename,
  CASE 
    WHEN rowsecurity = true THEN '✅ ENABLED'
    ELSE '❌ DISABLED'
  END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
  'user_profiles',
  'courses',
  'videos',
  'video_view_logs',
  'user_courses',
  'course_completions',
  'certificates',
  'system_settings',
  'support_conversations',
  'support_messages'
)
ORDER BY tablename;

-- ===========================================
-- 3. RLSポリシーの数を確認
-- ===========================================
SELECT 
  'RLS Policies' as check_type,
  tablename,
  COUNT(*) as policy_count,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ HAS POLICIES'
    ELSE '⚠️ NO POLICIES'
  END as status
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- ===========================================
-- 4. user_profilesテーブルの構造確認
-- ===========================================
SELECT 
  'Column Check - user_profiles' as check_type,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'user_profiles'
ORDER BY ordinal_position;

-- ===========================================
-- 5. 外部キー制約の確認
-- ===========================================
SELECT
  'Foreign Keys' as check_type,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  '✅ OK' as status
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- ===========================================
-- 6. インデックスの確認
-- ===========================================
SELECT 
  'Index Check' as check_type,
  tablename,
  indexname,
  '✅ EXISTS' as status
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN (
  'user_profiles',
  'courses',
  'videos',
  'video_view_logs'
)
ORDER BY tablename, indexname;

-- ===========================================
-- 7. トリガーの確認
-- ===========================================
SELECT 
  'Triggers' as check_type,
  event_object_table as table_name,
  trigger_name,
  event_manipulation as trigger_event,
  '✅ EXISTS' as status
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table;

-- ===========================================
-- 8. 現在のユーザー権限確認
-- ===========================================
SELECT 
  'Current User' as check_type,
  current_user as username,
  current_database() as database,
  version() as postgres_version;

-- ===========================================
-- 9. auth.usersテーブルの状態
-- ===========================================
SELECT 
  'Auth Users Count' as check_type,
  COUNT(*) as total_users,
  COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as new_users_last_week
FROM auth.users;

-- ===========================================
-- 10. user_profilesテーブルのデータ整合性
-- ===========================================
SELECT 
  'Data Integrity' as check_type,
  'user_profiles vs auth.users' as comparison,
  (SELECT COUNT(*) FROM user_profiles) as profiles_count,
  (SELECT COUNT(*) FROM auth.users) as auth_users_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM user_profiles) = (SELECT COUNT(*) FROM auth.users) THEN '✅ MATCHED'
    ELSE '⚠️ MISMATCH'
  END as status;

-- ===========================================
-- 11. 最近のエラーログ確認（system_logsがある場合）
-- ===========================================
SELECT 
  'Recent Errors' as check_type,
  COUNT(*) as error_count_last_24h
FROM system_logs
WHERE action LIKE '%error%'
AND created_at > NOW() - INTERVAL '24 hours';

-- ===========================================
-- 診断結果サマリー
-- ===========================================
SELECT '
===========================================
診断完了！

以下の点を確認してください：

1. ❌ が表示されている項目は問題がある可能性があります
2. ⚠️ が表示されている項目は注意が必要です
3. ✅ が表示されている項目は正常です

もし問題が見つかった場合：
- テーブルが存在しない → schema.sqlを実行
- RLSが無効 → RLSを有効化
- ポリシーがない → RLSポリシーを追加
- データ不整合 → データ移行スクリプトを実行

===========================================
' as diagnosis_summary;