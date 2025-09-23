-- 特定のユーザーをデータベースから削除するスクリプト
-- 実行前に必ずユーザーIDを確認してください

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

-- 2. 関連データの確認（削除される内容を事前確認）
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
  'messages' as table_name, COUNT(*) as record_count 
FROM messages 
WHERE sender_id IN (SELECT id FROM target_users) OR receiver_id IN (SELECT id FROM target_users)
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

-- 3. 関連データを削除（CASCADE設定により自動削除されるものもありますが、念のため明示的に削除）
DO $$ 
DECLARE
  user_record RECORD;
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
    
    -- 視聴履歴を削除
    DELETE FROM video_view_logs WHERE user_id = user_record.id;
    
    -- コース割り当てを削除
    DELETE FROM user_courses WHERE user_id = user_record.id;
    
    -- コース完了記録を削除
    DELETE FROM course_completions WHERE user_id = user_record.id;
    
    -- 証明書を削除
    DELETE FROM certificates WHERE user_id = user_record.id;
    
    -- メッセージを削除（送信者または受信者として）
    DELETE FROM messages WHERE sender_id = user_record.id OR receiver_id = user_record.id;
    
    -- サポート会話を削除
    DELETE FROM support_conversations WHERE student_id = user_record.id;
    
    -- サポートメッセージを削除
    DELETE FROM support_messages WHERE sender_id = user_record.id;
    
    -- 通知を削除
    DELETE FROM notifications WHERE user_id = user_record.id;
    
    -- システムログを削除
    DELETE FROM system_logs WHERE user_id = user_record.id;
    
    -- user_profilesから削除
    DELETE FROM user_profiles WHERE id = user_record.id;
    
    RAISE NOTICE 'User % deleted from user_profiles', user_record.id;
  END LOOP;
  
  RAISE NOTICE 'User deletion process completed';
END $$;

-- 4. auth.usersテーブルからも削除（Supabase Auth）
-- 注意: この操作にはサービスロールキーが必要です
-- Supabaseダッシュボードから手動で削除することをお勧めします

-- 以下のコメントアウトされたクエリは、削除したいユーザーのIDが分かっている場合に使用できます
-- ただし、auth.usersテーブルへの直接削除は推奨されません

/*
-- auth.usersから削除する場合（管理者権限が必要）
DELETE FROM auth.users 
WHERE id IN (
  SELECT id 
  FROM user_profiles 
  WHERE 
    display_name LIKE '%安藤%蓮%' 
    OR display_name LIKE '%Test User%'
    OR display_name LIKE '%test%'
    OR email LIKE '%r.ando%'
    OR email LIKE '%mrconsul%'
);
*/

-- 5. 削除後の確認
SELECT 
  'Remaining users with similar names:' as message,
  COUNT(*) as count
FROM user_profiles
WHERE 
  display_name LIKE '%安藤%' 
  OR display_name LIKE '%Test%'
  OR email LIKE '%ando%'
  OR email LIKE '%test%';

-- 完了メッセージ
SELECT 'User deletion completed. Please also delete these users from Supabase Authentication tab.' as status;