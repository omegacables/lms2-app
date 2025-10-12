-- 複数の視聴履歴を保存できるようにUNIQUE制約を削除
-- video_view_logsテーブルから(user_id, video_id)のUNIQUE制約を削除

-- まず既存の制約名を確認（通常は video_view_logs_user_id_video_id_key）
-- 制約を削除
ALTER TABLE video_view_logs
DROP CONSTRAINT IF EXISTS video_view_logs_user_id_video_id_key;

-- インデックスを追加して検索パフォーマンスを維持
-- (user_id, video_id, created_at DESC) で最新の履歴を効率的に取得
CREATE INDEX IF NOT EXISTS idx_video_view_logs_user_video_created
ON video_view_logs(user_id, video_id, created_at DESC);

-- 完了済みの視聴ログを効率的に検索するためのインデックス
CREATE INDEX IF NOT EXISTS idx_video_view_logs_status
ON video_view_logs(user_id, video_id, status)
WHERE status = 'completed';

COMMENT ON TABLE video_view_logs IS '動画視聴ログ: 完了まで複数回保存可能';
