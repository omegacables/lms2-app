-- 視聴ログテーブルのUNIQUE制約を削除
-- これにより、完了(100%)になるまで複数の視聴ログを記録できるようになる

-- 既存のUNIQUE制約を削除
ALTER TABLE video_view_logs DROP CONSTRAINT IF EXISTS video_view_logs_user_id_video_id_key;

-- 検索効率のため、user_id, video_id, created_atの複合インデックスを追加
CREATE INDEX IF NOT EXISTS idx_video_view_logs_user_video_created
ON video_view_logs(user_id, video_id, created_at DESC);

-- 最新ログ取得用のインデックス
CREATE INDEX IF NOT EXISTS idx_video_view_logs_latest
ON video_view_logs(user_id, video_id, status, created_at DESC);
