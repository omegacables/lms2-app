-- support_conversationsテーブルの修正スクリプト V2
-- 既存のポリシーを安全に削除してから再作成

-- 1. support_conversationsの全ポリシーを削除
DO $$ 
BEGIN
  -- 既存のポリシーを全て削除
  DROP POLICY IF EXISTS "Users can view own conversations" ON support_conversations;
  DROP POLICY IF EXISTS "Students can view own conversations" ON support_conversations;
  DROP POLICY IF EXISTS "Users can create conversations" ON support_conversations;
  DROP POLICY IF EXISTS "Students can create conversations" ON support_conversations;
  DROP POLICY IF EXISTS "Admins can view all conversations" ON support_conversations;
  DROP POLICY IF EXISTS "Admins can update conversations" ON support_conversations;
  DROP POLICY IF EXISTS "Admins can manage all conversations" ON support_conversations;
  DROP POLICY IF EXISTS "Admins can manage conversations" ON support_conversations;
  
  RAISE NOTICE 'Dropped all existing policies for support_conversations';
END $$;

-- 2. support_messagesの全ポリシーを削除
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can view messages in their conversations" ON support_messages;
  DROP POLICY IF EXISTS "Users can send messages" ON support_messages;
  DROP POLICY IF EXISTS "Users can send messages in their conversations" ON support_messages;
  DROP POLICY IF EXISTS "Admins can view all messages" ON support_messages;
  DROP POLICY IF EXISTS "Admins can manage all messages" ON support_messages;
  
  RAISE NOTICE 'Dropped all existing policies for support_messages';
END $$;

-- 3. 新しいポリシーを作成（support_conversations）
-- 学生は自分の会話のみ閲覧可能
CREATE POLICY "policy_students_view_own_conversations" ON support_conversations
  FOR SELECT USING (auth.uid() = student_id);

-- 学生は新規会話を作成可能
CREATE POLICY "policy_students_create_conversations" ON support_conversations
  FOR INSERT WITH CHECK (auth.uid() = student_id);

-- 学生は自分の会話を更新可能
CREATE POLICY "policy_students_update_own_conversations" ON support_conversations
  FOR UPDATE USING (auth.uid() = student_id);

-- 管理者は全ての会話を閲覧可能
CREATE POLICY "policy_admins_view_all_conversations" ON support_conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 管理者は全ての会話を管理可能
CREATE POLICY "policy_admins_manage_all_conversations" ON support_conversations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 4. 新しいポリシーを作成（support_messages）
-- ユーザーは自分が関わる会話のメッセージを閲覧可能
CREATE POLICY "policy_users_view_conversation_messages" ON support_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_conversations 
      WHERE id = support_messages.conversation_id 
      AND (
        student_id = auth.uid() 
        OR EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

-- ユーザーは自分が関わる会話にメッセージを送信可能
CREATE POLICY "policy_users_send_messages" ON support_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM support_conversations 
      WHERE id = conversation_id 
      AND (
        student_id = auth.uid() 
        OR EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

-- 管理者は全てのメッセージを管理可能
CREATE POLICY "policy_admins_manage_all_messages" ON support_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 5. テーブル構造の確認と修正
-- subjectカラムが存在しない場合は追加
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'support_conversations' 
    AND column_name = 'subject'
  ) THEN
    ALTER TABLE support_conversations ADD COLUMN subject VARCHAR(200);
    RAISE NOTICE 'Added subject column to support_conversations';
  END IF;
END $$;

-- 6. admin_idカラムが存在する場合は削除（使用していないため）
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'support_conversations' 
    AND column_name = 'admin_id'
  ) THEN
    ALTER TABLE support_conversations DROP COLUMN admin_id;
    RAISE NOTICE 'Dropped admin_id column from support_conversations';
  END IF;
END $$;

-- 7. インデックスの確認と作成
CREATE INDEX IF NOT EXISTS idx_support_conversations_student ON support_conversations(student_id);
CREATE INDEX IF NOT EXISTS idx_support_conversations_status ON support_conversations(status);
CREATE INDEX IF NOT EXISTS idx_support_messages_conversation ON support_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_sender ON support_messages(sender_id);

-- 8. RLSが有効になっていることを確認
ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- 完了メッセージ
SELECT 'Support conversations tables and policies have been successfully configured!' as status,
       COUNT(*) as total_conversations 
FROM support_conversations;