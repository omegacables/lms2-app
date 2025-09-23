-- 特定のユーザーを強制削除するスクリプト
-- UID: 27ffdd74-6019-41bf-8ba9-7fa2a0332db7

-- 削除対象のUID
DO $$
DECLARE
  target_user_id UUID := '27ffdd74-6019-41bf-8ba9-7fa2a0332db7';
  table_name TEXT;
  delete_count INTEGER;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Starting force deletion for user: %', target_user_id;
  RAISE NOTICE '========================================';
  
  -- 1. video_view_logs から削除
  BEGIN
    DELETE FROM video_view_logs WHERE user_id = target_user_id;
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    IF delete_count > 0 THEN
      RAISE NOTICE 'Deleted % records from video_view_logs', delete_count;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table video_view_logs does not exist';
  END;
  
  -- 2. user_courses から削除
  BEGIN
    DELETE FROM user_courses WHERE user_id = target_user_id OR assigned_by = target_user_id;
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    IF delete_count > 0 THEN
      RAISE NOTICE 'Deleted % records from user_courses', delete_count;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table user_courses does not exist';
  END;
  
  -- 3. course_completions から削除
  BEGIN
    DELETE FROM course_completions WHERE user_id = target_user_id;
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    IF delete_count > 0 THEN
      RAISE NOTICE 'Deleted % records from course_completions', delete_count;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table course_completions does not exist';
  END;
  
  -- 4. certificates から削除
  BEGIN
    DELETE FROM certificates WHERE user_id = target_user_id;
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    IF delete_count > 0 THEN
      RAISE NOTICE 'Deleted % records from certificates', delete_count;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table certificates does not exist';
  END;
  
  -- 5. messages から削除（送信者または受信者として）
  BEGIN
    DELETE FROM messages WHERE sender_id = target_user_id OR receiver_id = target_user_id;
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    IF delete_count > 0 THEN
      RAISE NOTICE 'Deleted % records from messages', delete_count;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table messages does not exist';
  END;
  
  -- 6. support_conversations から削除
  BEGIN
    DELETE FROM support_conversations WHERE student_id = target_user_id;
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    IF delete_count > 0 THEN
      RAISE NOTICE 'Deleted % records from support_conversations', delete_count;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table support_conversations does not exist';
  END;
  
  -- 7. support_messages から削除
  BEGIN
    DELETE FROM support_messages WHERE sender_id = target_user_id;
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    IF delete_count > 0 THEN
      RAISE NOTICE 'Deleted % records from support_messages', delete_count;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table support_messages does not exist';
  END;
  
  -- 8. notifications から削除
  BEGIN
    DELETE FROM notifications WHERE user_id = target_user_id;
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    IF delete_count > 0 THEN
      RAISE NOTICE 'Deleted % records from notifications', delete_count;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table notifications does not exist';
  END;
  
  -- 9. system_logs から削除
  BEGIN
    DELETE FROM system_logs WHERE user_id = target_user_id;
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    IF delete_count > 0 THEN
      RAISE NOTICE 'Deleted % records from system_logs', delete_count;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table system_logs does not exist';
  END;
  
  -- 10. system_settings から削除（updated_by として）
  BEGIN
    UPDATE system_settings SET updated_by = NULL WHERE updated_by = target_user_id;
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    IF delete_count > 0 THEN
      RAISE NOTICE 'Updated % records in system_settings', delete_count;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table system_settings does not exist';
  END;
  
  -- 11. courses から削除（created_by として）
  BEGIN
    UPDATE courses SET created_by = NULL WHERE created_by = target_user_id;
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    IF delete_count > 0 THEN
      RAISE NOTICE 'Updated % records in courses', delete_count;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table courses does not exist';
  END;
  
  -- 12. announcements から削除（created_by として）
  BEGIN
    UPDATE announcements SET created_by = NULL WHERE created_by = target_user_id;
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    IF delete_count > 0 THEN
      RAISE NOTICE 'Updated % records in announcements', delete_count;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table announcements does not exist';
  END;
  
  -- 13. user_profiles から削除（最後に実行）
  BEGIN
    DELETE FROM user_profiles WHERE id = target_user_id;
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    IF delete_count > 0 THEN
      RAISE NOTICE 'Deleted user from user_profiles';
    ELSE
      RAISE NOTICE 'User not found in user_profiles';
    END IF;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table user_profiles does not exist';
  END;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All related data has been cleaned up';
  RAISE NOTICE 'You can now delete the user from Authentication tab';
  RAISE NOTICE '========================================';
END $$;

-- auth.usersテーブルの外部キー制約を確認
SELECT 
  'Foreign Key Constraints to auth.users' as check_type,
  conname as constraint_name,
  conrelid::regclass as table_name,
  a.attname as column_name
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
WHERE c.confrelid = 'auth.users'::regclass
ORDER BY conrelid::regclass::text, a.attname;

-- このユーザーを参照している可能性のあるデータを確認
SELECT 'Checking remaining references...' as status;

-- user_profilesでの確認
SELECT 'user_profiles' as table_name, COUNT(*) as count 
FROM user_profiles 
WHERE id = '27ffdd74-6019-41bf-8ba9-7fa2a0332db7';

-- 他のテーブルでの参照を確認
SELECT 'video_view_logs' as table_name, COUNT(*) as count 
FROM video_view_logs 
WHERE user_id = '27ffdd74-6019-41bf-8ba9-7fa2a0332db7'
UNION ALL
SELECT 'user_courses' as table_name, COUNT(*) as count 
FROM user_courses 
WHERE user_id = '27ffdd74-6019-41bf-8ba9-7fa2a0332db7' OR assigned_by = '27ffdd74-6019-41bf-8ba9-7fa2a0332db7'
UNION ALL
SELECT 'support_conversations' as table_name, COUNT(*) as count 
FROM support_conversations 
WHERE student_id = '27ffdd74-6019-41bf-8ba9-7fa2a0332db7';

-- 完了メッセージ
SELECT '
===========================================
削除準備完了！

関連データはすべて削除されました。
次の手順：

1. Supabase Dashboard → Authentication
2. Users タブ
3. UID: 27ffdd74-6019-41bf-8ba9-7fa2a0332db7 を探す
4. 「...」メニュー → Delete user

まだ削除できない場合：
- 上記の外部キー制約リストを確認
- 残っている参照データがないか確認

===========================================
' as next_steps;