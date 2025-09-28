-- コースにmetadataフィールドを追加（チャプター情報などを保存）
ALTER TABLE courses
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{"chapters": []}'::jsonb;

-- 既存のコースにデフォルト値を設定
UPDATE courses
SET metadata = '{"chapters": []}'::jsonb
WHERE metadata IS NULL;