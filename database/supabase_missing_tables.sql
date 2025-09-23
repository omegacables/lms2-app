-- Supabase SQL Editor用 - 不足しているテーブルとカラムの追加スクリプト
-- 実行前に既存のテーブルを確認してください

-- 1. user_profilesテーブルにemailカラムを追加（既に存在しない場合）
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' 
    AND column_name = 'email'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN email VARCHAR(255);
  END IF;
END $$;

-- 2. coursesテーブルにthumbnail_file_pathカラムを追加（既に存在しない場合）
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'courses' 
    AND column_name = 'thumbnail_file_path'
  ) THEN
    ALTER TABLE courses ADD COLUMN thumbnail_file_path VARCHAR(255);
  END IF;
END $$;

-- 3. サポートチャット会話管理テーブル（存在しない場合のみ作成）
CREATE TABLE IF NOT EXISTS support_conversations (
  id SERIAL PRIMARY KEY,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES auth.users(id),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. サポートメッセージテーブル（存在しない場合のみ作成）
CREATE TABLE IF NOT EXISTS support_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES support_conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. お知らせ管理テーブル（存在しない場合のみ作成）
CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'info' CHECK (type IN ('info', 'warning', 'urgent', 'maintenance')),
  target_role VARCHAR(20) CHECK (target_role IN ('all', 'student', 'instructor', 'admin')),
  is_active BOOLEAN DEFAULT true,
  display_from TIMESTAMP DEFAULT NOW(),
  display_until TIMESTAMP,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. 通知管理テーブル（存在しない場合のみ作成）
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'info',
  related_type VARCHAR(50),
  related_id INTEGER,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 7. インデックスの作成（存在しない場合のみ）
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_support_conversations_student ON support_conversations(student_id);
CREATE INDEX IF NOT EXISTS idx_support_conversations_status ON support_conversations(status);
CREATE INDEX IF NOT EXISTS idx_support_messages_conversation ON support_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, display_from, display_until);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- 8. RLSの有効化
ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 9. RLSポリシーの作成（存在しない場合のみ）

-- support_conversations ポリシー
DROP POLICY IF EXISTS "Users can view own conversations" ON support_conversations;
CREATE POLICY "Users can view own conversations" ON support_conversations
  FOR SELECT USING (auth.uid() = student_id OR auth.uid() = admin_id);

DROP POLICY IF EXISTS "Users can create conversations" ON support_conversations;
CREATE POLICY "Users can create conversations" ON support_conversations
  FOR INSERT WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Admins can view all conversations" ON support_conversations;
CREATE POLICY "Admins can view all conversations" ON support_conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update conversations" ON support_conversations;
CREATE POLICY "Admins can update conversations" ON support_conversations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- support_messages ポリシー
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON support_messages;
CREATE POLICY "Users can view messages in their conversations" ON support_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_conversations 
      WHERE id = support_messages.conversation_id 
      AND (student_id = auth.uid() OR admin_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can send messages" ON support_messages;
CREATE POLICY "Users can send messages" ON support_messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Admins can view all messages" ON support_messages;
CREATE POLICY "Admins can view all messages" ON support_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- announcements ポリシー
DROP POLICY IF EXISTS "Active announcements visible to all" ON announcements;
CREATE POLICY "Active announcements visible to all" ON announcements
  FOR SELECT USING (
    is_active = true 
    AND NOW() >= display_from 
    AND (display_until IS NULL OR NOW() <= display_until)
  );

DROP POLICY IF EXISTS "Admins can manage announcements" ON announcements;
CREATE POLICY "Admins can manage announcements" ON announcements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- notifications ポリシー
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can create notifications" ON notifications;
CREATE POLICY "System can create notifications" ON notifications
  FOR INSERT WITH CHECK (true);

-- 10. トリガーの作成（存在しない場合のみ）
DROP TRIGGER IF EXISTS update_support_conversations_updated_at ON support_conversations;
CREATE TRIGGER update_support_conversations_updated_at BEFORE UPDATE ON support_conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_announcements_updated_at ON announcements;
CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 11. プロフィール作成関数の更新
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, display_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email), 'student')
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. 既存ユーザーのemailフィールドを更新
UPDATE user_profiles up
SET email = u.email
FROM auth.users u
WHERE up.id = u.id
AND up.email IS NULL;

-- 13. video_view_logsテーブルのユニーク制約を確認・削除（削除ポリシーのため）
ALTER TABLE video_view_logs DROP CONSTRAINT IF EXISTS video_view_logs_user_id_video_id_key;

-- 14. 管理者権限でvideo_view_logsを削除できるポリシーを追加
DROP POLICY IF EXISTS "Admins can delete all progress" ON video_view_logs;
CREATE POLICY "Admins can delete all progress" ON video_view_logs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 15. Storageバケットの作成（course-thumbnails）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES (
  'course-thumbnails', 
  'course-thumbnails', 
  true, 
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 5242880;

-- 16. システム設定のupsert用に一意制約を確認
ALTER TABLE system_settings DROP CONSTRAINT IF EXISTS system_settings_setting_key_key;
ALTER TABLE system_settings ADD CONSTRAINT system_settings_setting_key_key UNIQUE (setting_key);

-- 完了メッセージ
SELECT 'Migration completed successfully!' as status;