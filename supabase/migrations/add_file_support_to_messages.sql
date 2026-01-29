-- support_messagesテーブルにファイル送信機能を追加
-- 画像、PDF、その他のファイルを送信可能にする

-- ファイル関連のカラムを追加
ALTER TABLE support_messages
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS file_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS file_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS file_size INTEGER;

-- Storageバケットを作成（chat-files）
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-files', 'chat-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storageポリシーを設定
-- 認証済みユーザーはアップロード可能
CREATE POLICY "Authenticated users can upload chat files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-files');

-- 全員が閲覧可能（publicバケット）
CREATE POLICY "Anyone can view chat files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'chat-files');

-- ファイルの所有者は削除可能
CREATE POLICY "Users can delete own chat files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'chat-files' AND auth.uid()::text = (storage.foldername(name))[1]);
