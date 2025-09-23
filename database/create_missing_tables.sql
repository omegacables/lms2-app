-- 不足しているテーブルを作成するスクリプト

-- ===========================================
-- 1. system_settingsテーブルを作成
-- ===========================================
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT,
  setting_type VARCHAR(20) DEFAULT 'string' CHECK (setting_type IN ('string', 'number', 'boolean', 'json')),
  description TEXT,
  category VARCHAR(50) DEFAULT 'general',
  is_public BOOLEAN DEFAULT false,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);
CREATE INDEX IF NOT EXISTS idx_system_settings_public ON system_settings(is_public);

-- RLSを有効化
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- RLSポリシーを作成
DROP POLICY IF EXISTS "Public settings visible to all" ON system_settings;
CREATE POLICY "Public settings visible to all" ON system_settings
  FOR SELECT USING (is_public = true);

DROP POLICY IF EXISTS "Admins can view all settings" ON system_settings;
CREATE POLICY "Admins can view all settings" ON system_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage all settings" ON system_settings;
CREATE POLICY "Admins can manage all settings" ON system_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ===========================================
-- 2. system_logsテーブルを作成（存在しない場合）
-- ===========================================
CREATE TABLE IF NOT EXISTS system_logs (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(50),
  ip_address INET,
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_system_logs_user_action ON system_logs(user_id, action);
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at DESC);

-- RLSを有効化
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- RLSポリシー（管理者のみアクセス可能）
DROP POLICY IF EXISTS "Admins can view system logs" ON system_logs;
CREATE POLICY "Admins can view system logs" ON system_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ===========================================
-- 3. support_conversationsテーブルを作成（存在しない場合）
-- ===========================================
CREATE TABLE IF NOT EXISTS support_conversations (
  id SERIAL PRIMARY KEY,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subject VARCHAR(200),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_conversations_student ON support_conversations(student_id);
CREATE INDEX IF NOT EXISTS idx_support_conversations_status ON support_conversations(status);

ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- 4. support_messagesテーブルを作成（存在しない場合）
-- ===========================================
CREATE TABLE IF NOT EXISTS support_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES support_conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_conversation ON support_messages(conversation_id);

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- 5. トリガー関数の作成（存在しない場合）
-- ===========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- トリガーの作成
DROP TRIGGER IF EXISTS update_system_settings_updated_at ON system_settings;
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_support_conversations_updated_at ON support_conversations;
CREATE TRIGGER update_support_conversations_updated_at BEFORE UPDATE ON support_conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- 6. デフォルトのシステム設定を追加
-- ===========================================
INSERT INTO system_settings (setting_key, setting_value, setting_type, category, description, is_public)
VALUES 
  ('general.site_name', 'SKILLUP LMS', 'string', 'general', 'サイト名', true),
  ('general.site_description', '企業向け学習管理システム', 'string', 'general', 'サイト説明', true),
  ('general.default_language', 'ja', 'string', 'general', 'デフォルト言語', false),
  ('general.timezone', 'Asia/Tokyo', 'string', 'general', 'タイムゾーン', true),
  ('email.enable_notifications', 'true', 'boolean', 'email', 'メール通知の有効化', false),
  ('security.session_timeout_hours', '24', 'number', 'security', 'セッションタイムアウト時間', false),
  ('security.password_min_length', '8', 'number', 'security', 'パスワード最小文字数', false),
  ('storage.allowed_video_formats', '["mp4", "webm", "avi"]', 'json', 'storage', '許可する動画形式', false),
  ('storage.allowed_image_formats', '["jpg", "jpeg", "png", "gif"]', 'json', 'storage', '許可する画像形式', false),
  ('learning.default_completion_threshold', '80', 'number', 'learning', 'デフォルト完了閾値', false),
  ('learning.auto_certificate_generation', 'true', 'boolean', 'learning', '証明書自動生成', false)
ON CONFLICT (setting_key) DO UPDATE
SET 
  setting_value = EXCLUDED.setting_value,
  updated_at = NOW();

-- ===========================================
-- 7. 結果確認
-- ===========================================
SELECT 
  'Tables Created' as status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'system_settings') as system_settings_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'system_logs') as system_logs_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'support_conversations') as support_conversations_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'support_messages') as support_messages_exists;

SELECT 
  'Settings Added' as status,
  COUNT(*) as total_settings
FROM system_settings;

-- 完了メッセージ
SELECT '
===========================================
テーブル作成完了！

作成されたテーブル:
- system_settings (システム設定)
- system_logs (システムログ)
- support_conversations (サポート会話)
- support_messages (サポートメッセージ)

次のステップ:
1. fix_database_issues.sql を再実行
2. ユーザー同期とStorageバケット作成

===========================================
' as completion_message;