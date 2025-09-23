-- 特定のユーザーをデータベースから削除するスクリプト V2
-- 存在しないテーブルをスキップするバージョン

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

-- 2. 関連データの確認（存在するテーブルのみ）
WITH target_users AS (
  SELECT id 
  FROM user_profiles 
  WHERE 
    display_name LIKE '%安藤%蓮%' 
    OR display_name LIKE '%Test User%'
    OR display_name LIKE '%test%'
    OR email LIKE '%r.ando%'
    OR email LIKE '%mrconsul%'
)
SELECT 
  'video_view_logs' as table_name, COUNT(*) as record_count 
FROM video_view_logs 
WHERE user_id IN (SELECT id FROM target_users)
UNION ALL
SELECT 
  'user_courses' as table_name, COUNT(*) as record_count 
FROM user_courses 
WHERE user_id IN (SELECT id FROM target_users)
UNION ALL
SELECT 
  'course_completions' as table_name, COUNT(*) as record_count 
FROM course_completions 
WHERE user_id IN (SELECT id FROM target_users)
UNION ALL
SELECT 
  'certificates' as table_name, COUNT(*) as record_count 
FROM certificates 
WHERE user_id IN (SELECT id FROM target_users)
UNION ALL
SELECT 
  'support_conversations' as table_name, COUNT(*) as record_count 
FROM support_conversations 
WHERE student_id IN (SELECT id FROM target_users)
UNION ALL
SELECT 
  'support_messages' as table_name, COUNT(*) as record_count 
FROM support_messages 
WHERE sender_id IN (SELECT id FROM target_users)
UNION ALL
SELECT 
  'notifications' as table_name, COUNT(*) as record_count 
FROM notifications 
WHERE user_id IN (SELECT id FROM target_users);

-- 3. 関連データを安全に削除（テーブルの存在を確認しながら）
DO $$ 
DECLARE
  user_record RECORD;
  table_exists BOOLEAN;
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
    RAISE NOTICE 'Processing user: % (%, %)', user_record.id, user_record.display_name, user_record.email;
    
    -- video_view_logsテーブルが存在する場合のみ削除
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'video_view_logs') THEN
      DELETE FROM video_view_logs WHERE user_id = user_record.id;
      RAISE NOTICE '  - Deleted from video_view_logs';
    END IF;
    
    -- user_coursesテーブルが存在する場合のみ削除
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_courses') THEN
      DELETE FROM user_courses WHERE user_id = user_record.id;
      RAISE NOTICE '  - Deleted from user_courses';
    END IF;
    
    -- course_completionsテーブルが存在する場合のみ削除
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'course_completions') THEN
      DELETE FROM course_completions WHERE user_id = user_record.id;
      RAISE NOTICE '  - Deleted from course_completions';
    END IF;
    
    -- certificatesテーブルが存在する場合のみ削除
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'certificates') THEN
      DELETE FROM certificates WHERE user_id = user_record.id;
      RAISE NOTICE '  - Deleted from certificates';
    END IF;
    
    -- support_conversationsテーブルが存在する場合のみ削除
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'support_conversations') THEN
      DELETE FROM support_conversations WHERE student_id = user_record.id;
      RAISE NOTICE '  - Deleted from support_conversations';
    END IF;
    
    -- support_messagesテーブルが存在する場合のみ削除  
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'support_messages') THEN
      DELETE FROM support_messages WHERE sender_id = user_record.id;
      RAISE NOTICE '  - Deleted from support_messages';
    END IF;
    
    -- notificationsテーブルが存在する場合のみ削除
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
      DELETE FROM notifications WHERE user_id = user_record.id;
      RAISE NOTICE '  - Deleted from notifications';
    END IF;
    
    -- system_logsテーブルが存在する場合のみ削除
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_logs') THEN
      DELETE FROM system_logs WHERE user_id = user_record.id;
      RAISE NOTICE '  - Deleted from system_logs';
    END IF;
    
    -- user_profilesから削除（これは必ず存在する）
    DELETE FROM user_profiles WHERE id = user_record.id;
    RAISE NOTICE '  - User deleted from user_profiles';
    
    RAISE NOTICE 'User % processing completed', user_record.id;
  END LOOP;
  
  RAISE NOTICE 'All user deletion completed successfully';
END $$;

-- 4. 削除後の確認
SELECT 
  'Deletion complete. Remaining users check:' as status,
  COUNT(*) as remaining_count
FROM user_profiles
WHERE 
  display_name LIKE '%安藤%' 
  OR display_name LIKE '%Test%'
  OR email LIKE '%ando%'
  OR email LIKE '%test%';

-- 5. 削除されたユーザーの一覧（存在しないはず）
SELECT 
  id,
  display_name,
  email,
  role
FROM user_profiles
WHERE 
  display_name LIKE '%安藤%' 
  OR display_name LIKE '%Test%'
  OR email LIKE '%ando%'
  OR email LIKE '%test%';

-- 完了メッセージ
SELECT '
===========================================
User deletion from database completed!

IMPORTANT: You still need to delete users from:
1. Supabase Authentication tab
2. Go to Authentication > Users
3. Find and delete the users manually

===========================================
' as next_steps;