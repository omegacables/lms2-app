-- ユーザー削除用シンプルスクリプト
-- 確実に存在するテーブルのみを対象

-- 1. 削除対象のユーザーを確認
SELECT 
  up.id,
  up.display_name,
  up.email,
  up.role,
  up.created_at
FROM user_profiles up
WHERE 
  up.display_name LIKE '%安藤%蓮%' 
  OR up.display_name LIKE '%Test User%'
  OR up.display_name LIKE '%test%'
  OR up.email LIKE '%r.ando%'
  OR up.email LIKE '%mrconsul%';

-- 2. 削除対象ユーザーのIDを取得して関連データを削除
WITH target_users AS (
  SELECT id, display_name, email
  FROM user_profiles 
  WHERE 
    display_name LIKE '%安藤%蓮%' 
    OR display_name LIKE '%Test User%'
    OR display_name LIKE '%test%'
    OR email LIKE '%r.ando%'
    OR email LIKE '%mrconsul%'
)
SELECT * FROM target_users;

-- 3. 関連データの削除（確実に存在するテーブルのみ）
DO $$ 
DECLARE
  user_record RECORD;
  deleted_count INTEGER := 0;
BEGIN
  -- 削除対象のユーザーをループ処理
  FOR user_record IN 
    SELECT id, display_name, email 
    FROM user_profiles 
    WHERE 
      display_name LIKE '%安藤%蓮%' 
      OR display_name LIKE '%Test User%'
      OR display_name LIKE '%test%'
      OR email LIKE '%r.ando%'
      OR email LIKE '%mrconsul%'
  LOOP
    RAISE NOTICE 'Deleting user: % (%, %)', user_record.id, user_record.display_name, user_record.email;
    
    -- video_view_logs（視聴履歴）を削除
    BEGIN
      DELETE FROM video_view_logs WHERE user_id = user_record.id;
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      IF deleted_count > 0 THEN
        RAISE NOTICE '  - Deleted % records from video_view_logs', deleted_count;
      END IF;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE '  - video_view_logs table does not exist, skipping';
    END;
    
    -- user_courses（コース割り当て）を削除
    BEGIN
      DELETE FROM user_courses WHERE user_id = user_record.id;
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      IF deleted_count > 0 THEN
        RAISE NOTICE '  - Deleted % records from user_courses', deleted_count;
      END IF;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE '  - user_courses table does not exist, skipping';
    END;
    
    -- course_completions（コース完了記録）を削除
    BEGIN
      DELETE FROM course_completions WHERE user_id = user_record.id;
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      IF deleted_count > 0 THEN
        RAISE NOTICE '  - Deleted % records from course_completions', deleted_count;
      END IF;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE '  - course_completions table does not exist, skipping';
    END;
    
    -- certificates（証明書）を削除
    BEGIN
      DELETE FROM certificates WHERE user_id = user_record.id;
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      IF deleted_count > 0 THEN
        RAISE NOTICE '  - Deleted % records from certificates', deleted_count;
      END IF;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE '  - certificates table does not exist, skipping';
    END;
    
    -- support_conversations（サポート会話）を削除
    BEGIN
      DELETE FROM support_conversations WHERE student_id = user_record.id;
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      IF deleted_count > 0 THEN
        RAISE NOTICE '  - Deleted % records from support_conversations', deleted_count;
      END IF;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE '  - support_conversations table does not exist, skipping';
    END;
    
    -- support_messages（サポートメッセージ）を削除
    BEGIN
      DELETE FROM support_messages WHERE sender_id = user_record.id;
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      IF deleted_count > 0 THEN
        RAISE NOTICE '  - Deleted % records from support_messages', deleted_count;
      END IF;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE '  - support_messages table does not exist, skipping';
    END;
    
  END LOOP;
  
  -- user_profilesから削除（最後に実行）
  DELETE FROM user_profiles 
  WHERE 
    display_name LIKE '%安藤%蓮%' 
    OR display_name LIKE '%Test User%'
    OR display_name LIKE '%test%'
    OR email LIKE '%r.ando%'
    OR email LIKE '%mrconsul%';
    
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '====================================';
  RAISE NOTICE 'Deleted % users from user_profiles', deleted_count;
  RAISE NOTICE '====================================';
  
END $$;

-- 4. 削除確認
SELECT 
  COUNT(*) as remaining_users,
  CASE 
    WHEN COUNT(*) = 0 THEN 'SUCCESS: All target users have been deleted'
    ELSE 'WARNING: Some users may still exist'
  END as status
FROM user_profiles
WHERE 
  display_name LIKE '%安藤%' 
  OR display_name LIKE '%Test%'
  OR email LIKE '%ando%'
  OR email LIKE '%test%';

-- 5. 残っているユーザーの確認（あれば表示）
SELECT 
  id,
  display_name,
  email,
  role,
  created_at
FROM user_profiles
WHERE 
  display_name LIKE '%安藤%' 
  OR display_name LIKE '%Test%'
  OR email LIKE '%ando%'
  OR email LIKE '%test%';

-- 完了メッセージ
SELECT '
===========================================
Database deletion completed!

NEXT STEPS (REQUIRED):
1. Go to Supabase Dashboard
2. Navigate to Authentication > Users
3. Find the users and delete them manually
4. This will remove them from auth.users table

Note: Only user_profiles data was deleted.
Complete removal requires Authentication deletion.
===========================================
' as important_message;