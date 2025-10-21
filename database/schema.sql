-- LMS データベーススキーマ（要件定義準拠）

-- ユーザープロフィール拡張
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email VARCHAR(255),
  display_name VARCHAR(100),
  company VARCHAR(100),
  department VARCHAR(100),
  role VARCHAR(20) DEFAULT 'student' CHECK (role IN ('student', 'instructor', 'admin')),
  avatar_url VARCHAR(255),
  last_login_at TIMESTAMP,
  password_changed_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- コース管理
CREATE TABLE courses (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  thumbnail_url VARCHAR(255),
  thumbnail_file_path VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  category VARCHAR(50),
  difficulty_level VARCHAR(20) CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
  estimated_duration INTEGER, -- 分
  completion_threshold INTEGER DEFAULT 95 CHECK (completion_threshold BETWEEN 1 AND 100),
  order_index INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ユーザーコース関係管理（コース割り当て）
CREATE TABLE user_courses (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  due_date TIMESTAMP,
  status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'overdue')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, course_id)
);

-- 動画管理
CREATE TABLE videos (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  file_url VARCHAR(500) NOT NULL,
  duration INTEGER NOT NULL, -- 秒
  file_size BIGINT,
  mime_type VARCHAR(50),
  thumbnail_url VARCHAR(255),
  order_index INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 視聴ログ（要件ID: PROGRESS-01〜05対応）
CREATE TABLE video_view_logs (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  session_id UUID DEFAULT gen_random_uuid(),
  start_time TIMESTAMP DEFAULT NOW(),
  end_time TIMESTAMP,
  current_position INTEGER DEFAULT 0, -- 最後に視聴した位置（秒）
  total_watched_time INTEGER DEFAULT 0, -- 累計視聴時間（秒）
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  status VARCHAR(20) DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  completed_at TIMESTAMP,
  last_updated TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
  -- UNIQUE制約を削除: 完了まで複数ログを記録するため
);

-- コース完了記録（要件ID: CERT-01対応）
CREATE TABLE course_completions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  completion_date TIMESTAMP DEFAULT NOW(),
  completion_rate INTEGER NOT NULL,
  certificate_id VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, course_id)
);

-- 証明書管理（要件ID: CERT-01〜05対応）
CREATE TABLE certificates (
  id VARCHAR(50) PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  user_name VARCHAR(100) NOT NULL,
  course_title VARCHAR(200) NOT NULL,
  completion_date DATE NOT NULL,
  pdf_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- チャット/メッセージ管理
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  subject VARCHAR(200),
  content TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'private' CHECK (message_type IN ('private', 'course', 'announcement')),
  is_read BOOLEAN DEFAULT false,
  parent_message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  attachment_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- サポートチャット会話管理
CREATE TABLE support_conversations (
  id SERIAL PRIMARY KEY,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subject VARCHAR(200),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- サポートメッセージ
CREATE TABLE support_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES support_conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- お知らせ管理
CREATE TABLE announcements (
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

-- 通知管理
CREATE TABLE notifications (
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

-- システム設定
CREATE TABLE system_settings (
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

-- システムログ（要件ID: SYS-05対応）
CREATE TABLE system_logs (
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

-- インデックス作成
CREATE INDEX idx_user_profiles_role ON user_profiles(role);
CREATE INDEX idx_user_profiles_active ON user_profiles(is_active);
CREATE INDEX idx_user_profiles_email ON user_profiles(email);
CREATE INDEX idx_user_courses_user ON user_courses(user_id);
CREATE INDEX idx_user_courses_course ON user_courses(course_id);
CREATE INDEX idx_user_courses_status ON user_courses(status);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_receiver ON messages(receiver_id);
CREATE INDEX idx_messages_course ON messages(course_id);
CREATE INDEX idx_messages_type_read ON messages(message_type, is_read);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_support_conversations_student ON support_conversations(student_id);
CREATE INDEX idx_support_conversations_status ON support_conversations(status);
CREATE INDEX idx_support_messages_conversation ON support_messages(conversation_id);
CREATE INDEX idx_announcements_active ON announcements(is_active, display_from, display_until);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_system_settings_key ON system_settings(setting_key);
CREATE INDEX idx_system_settings_category ON system_settings(category);
CREATE INDEX idx_system_settings_public ON system_settings(is_public);
CREATE INDEX idx_video_view_logs_user_course ON video_view_logs(user_id, course_id);
CREATE INDEX idx_video_view_logs_progress ON video_view_logs(progress_percent, status);
CREATE INDEX idx_video_view_logs_user_video_created ON video_view_logs(user_id, video_id, created_at DESC);
CREATE INDEX idx_video_view_logs_latest ON video_view_logs(user_id, video_id, status, created_at DESC);
CREATE INDEX idx_courses_status_category ON courses(status, category);
CREATE INDEX idx_videos_course_order ON videos(course_id, order_index);
CREATE INDEX idx_certificates_user ON certificates(user_id);
CREATE INDEX idx_system_logs_user_action ON system_logs(user_id, action);

-- Row Level Security（RLS）有効化
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_view_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- RLSポリシー設定

-- user_profiles ポリシー
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON user_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update all profiles" ON user_profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- user_courses ポリシー
CREATE POLICY "Users can view own course assignments" ON user_courses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all course assignments" ON user_courses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can manage course assignments" ON user_courses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- messages ポリシー
CREATE POLICY "Users can view their own messages" ON messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send messages" ON messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update their own messages" ON messages
  FOR UPDATE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Admins can view all messages" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can manage all messages" ON messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- system_settings ポリシー
CREATE POLICY "Public settings visible to all" ON system_settings
  FOR SELECT USING (is_public = true);

CREATE POLICY "Admins can view all settings" ON system_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can manage all settings" ON system_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- courses ポリシー
CREATE POLICY "Active courses visible to all users" ON courses
  FOR SELECT USING (status = 'active');

CREATE POLICY "Instructors and admins can manage courses" ON courses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role IN ('instructor', 'admin')
    )
  );

-- videos ポリシー
CREATE POLICY "Videos visible to all users" ON videos
  FOR SELECT USING (
    status = 'active' AND 
    EXISTS (
      SELECT 1 FROM courses 
      WHERE id = videos.course_id AND status = 'active'
    )
  );

CREATE POLICY "Instructors and admins can manage videos" ON videos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role IN ('instructor', 'admin')
    )
  );

-- video_view_logs ポリシー
CREATE POLICY "Users can view own progress" ON video_view_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own progress" ON video_view_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress records" ON video_view_logs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all progress" ON video_view_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- course_completions ポリシー
CREATE POLICY "Users can view own completions" ON course_completions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can create completions" ON course_completions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all completions" ON course_completions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- certificates ポリシー
CREATE POLICY "Users can view own certificates" ON certificates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can create certificates" ON certificates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all certificates" ON certificates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- system_logs ポリシー（管理者のみアクセス可能）
CREATE POLICY "Admins can view system logs" ON system_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- support_conversations ポリシー
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

-- support_messages ポリシー
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

CREATE POLICY "Users can send messages" ON support_messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Admins can view all messages" ON support_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- announcements ポリシー
CREATE POLICY "Active announcements visible to all" ON announcements
  FOR SELECT USING (
    is_active = true 
    AND NOW() >= display_from 
    AND (display_until IS NULL OR NOW() <= display_until)
  );

CREATE POLICY "Admins can manage announcements" ON announcements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- notifications ポリシー
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications" ON notifications
  FOR INSERT WITH CHECK (true);

-- 自動更新関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 自動更新トリガー
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON videos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_courses_updated_at BEFORE UPDATE ON user_courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_support_conversations_updated_at BEFORE UPDATE ON support_conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ユーザー登録時にプロフィールを自動作成する関数
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, display_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email), 'student');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ユーザー登録トリガー
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Storage buckets作成
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('avatars', 'avatars', true),
  ('videos', 'videos', false),
  ('thumbnails', 'thumbnails', true),
  ('certificates', 'certificates', false)
ON CONFLICT (id) DO NOTHING;

-- デフォルトシステム設定の挿入
INSERT INTO system_settings (setting_key, setting_value, setting_type, description, category, is_public) VALUES
  ('site_name', 'LMS システム', 'string', 'サイト名', 'general', true),
  ('site_description', '学習管理システム', 'string', 'サイトの説明', 'general', true),
  ('max_upload_size', '3221225472', 'number', '最大アップロードサイズ (バイト)', 'upload', false),
  ('allowed_video_formats', '["video/mp4", "video/webm", "video/quicktime"]', 'json', '許可された動画形式', 'upload', false),
  ('session_timeout', '7200', 'number', 'セッションタイムアウト (秒)', 'security', false),
  ('enable_notifications', 'true', 'boolean', '通知機能の有効化', 'general', false),
  ('default_completion_threshold', '95', 'number', 'デフォルト完了閾値 (%)', 'learning', false),
  ('enable_chat', 'true', 'boolean', 'チャット機能の有効化', 'features', false),
  ('maintenance_mode', 'false', 'boolean', 'メンテナンスモード', 'system', false),
  ('timezone', 'Asia/Tokyo', 'string', 'システムタイムゾーン', 'general', true)
ON CONFLICT (setting_key) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND 
    auth.uid()::text = (storage.foldername(name))[1] AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Users can view own avatar" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'avatars' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Public can view avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Instructors can upload videos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'videos' AND 
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role IN ('instructor', 'admin')
    )
  );

CREATE POLICY "Users can view videos" ON storage.objects
  FOR SELECT USING (bucket_id = 'videos');

CREATE POLICY "Public can view thumbnails" ON storage.objects
  FOR SELECT USING (bucket_id = 'thumbnails');

CREATE POLICY "Users can view own certificates" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'certificates' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );