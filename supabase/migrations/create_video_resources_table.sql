-- 動画リソース管理テーブルの作成
-- 配布資料、課題、参考資料、解説などを管理

-- attachments ストレージバケットを作成
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,
  52428800, -- 50MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- video_resources テーブルを作成
CREATE TABLE IF NOT EXISTS video_resources (
  id SERIAL PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  resource_type VARCHAR(50) NOT NULL, -- 'material', 'assignment', 'reference', 'explanation'
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_url TEXT,
  file_name VARCHAR(255),
  file_size INTEGER,
  file_type VARCHAR(100),
  content TEXT, -- For text-based resources like explanations
  display_order INTEGER DEFAULT 0,
  is_required BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_video_resources_video_id ON video_resources(video_id);
CREATE INDEX IF NOT EXISTS idx_video_resources_type ON video_resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_video_resources_display_order ON video_resources(display_order);

-- assignment_submissions テーブルを作成（課題提出用）
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id SERIAL PRIMARY KEY,
  resource_id INTEGER NOT NULL REFERENCES video_resources(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  submission_text TEXT,
  file_url TEXT,
  file_name VARCHAR(255),
  file_size INTEGER,
  file_type VARCHAR(100),
  status VARCHAR(50) DEFAULT 'submitted', -- 'submitted', 'reviewing', 'approved', 'rejected', 'needs_revision'
  feedback TEXT,
  score INTEGER,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(resource_id, user_id)
);

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_resource_id ON assignment_submissions(resource_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_user_id ON assignment_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_status ON assignment_submissions(status);

-- RLS（行レベルセキュリティ）を有効化
ALTER TABLE video_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;

-- video_resources policies
-- 認証済みユーザーは全てのリソースを閲覧可能
DROP POLICY IF EXISTS "Anyone can view video resources" ON video_resources;
CREATE POLICY "Anyone can view video resources" ON video_resources
  FOR SELECT
  TO authenticated
  USING (true);

-- 管理者とインストラクターのみ作成・更新・削除可能
DROP POLICY IF EXISTS "Admin and instructors can manage resources" ON video_resources;
CREATE POLICY "Admin and instructors can manage resources" ON video_resources
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'instructor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'instructor')
    )
  );

-- assignment_submissions policies
-- ユーザーは自分の提出を閲覧・作成・更新可能
DROP POLICY IF EXISTS "Users can manage own submissions" ON assignment_submissions;
CREATE POLICY "Users can manage own submissions" ON assignment_submissions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 管理者とインストラクターは全ての提出を閲覧可能
DROP POLICY IF EXISTS "Admin and instructors can view all submissions" ON assignment_submissions;
CREATE POLICY "Admin and instructors can view all submissions" ON assignment_submissions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'instructor')
    )
  );

-- 管理者とインストラクターは全ての提出を更新可能
DROP POLICY IF EXISTS "Admin and instructors can update submissions" ON assignment_submissions;
CREATE POLICY "Admin and instructors can update submissions" ON assignment_submissions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'instructor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'instructor')
    )
  );

-- attachments バケットの RLS ポリシー
-- 管理者とインストラクターのみアップロード可能
DROP POLICY IF EXISTS "Admin and instructors can upload attachments" ON storage.objects;
CREATE POLICY "Admin and instructors can upload attachments" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'attachments' AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'instructor')
    )
  );

-- 認証済みユーザーは添付ファイルを閲覧可能
DROP POLICY IF EXISTS "Authenticated users can view attachments" ON storage.objects;
CREATE POLICY "Authenticated users can view attachments" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'attachments');

-- 管理者とインストラクターのみ削除可能
DROP POLICY IF EXISTS "Admin and instructors can delete attachments" ON storage.objects;
CREATE POLICY "Admin and instructors can delete attachments" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'attachments' AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'instructor')
    )
  );

-- 自動更新トリガー
CREATE OR REPLACE FUNCTION update_video_resources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_video_resources_updated_at_trigger ON video_resources;
CREATE TRIGGER update_video_resources_updated_at_trigger
  BEFORE UPDATE ON video_resources
  FOR EACH ROW
  EXECUTE FUNCTION update_video_resources_updated_at();
