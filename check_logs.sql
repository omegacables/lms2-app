-- 同じ動画IDの複数ログを確認
SELECT 
  id,
  video_id,
  user_id,
  progress_percent,
  start_time,
  end_time,
  created_at
FROM video_view_logs
ORDER BY video_id, end_time DESC
LIMIT 20;
