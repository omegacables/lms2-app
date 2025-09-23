-- support_conversationsテーブルの修正スクリプト
-- admin_idカラムが存在しないエラーの修正

-- 1. 既存のRLSポリシーを削除
DROP POLICY IF EXISTS "Users can view own conversations" ON support_conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON support_conversations;
DROP POLICY IF EXISTS "Admins can view all conversations" ON support_conversations;
DROP POLICY IF EXISTS "Admins can update conversations" ON support_conversations;

-- 2. 正しいRLSポリシーを作成（admin_idを使用しない）
CREATE POLICY "Students can view own conversations" ON support_conversations
  FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "Students can create conversations" ON support_conversations
  FOR INSERT WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Admins can view all conversations" ON support_conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can manage all conversations" ON support_conversations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 3. support_messagesのポリシーも修正
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON support_messages;
DROP POLICY IF EXISTS "Users can send messages" ON support_messages;
DROP POLICY IF EXISTS "Admins can view all messages" ON support_messages;

CREATE POLICY "Users can view messages in their conversations" ON support_messages
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

CREATE POLICY "Users can send messages in their conversations" ON support_messages
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

CREATE POLICY "Admins can manage all messages" ON support_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 完了メッセージ
SELECT 'Support conversations policies fixed successfully!' as status;