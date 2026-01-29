-- ===========================================
-- 証明書の再生成（コース完了したもののみ）
-- 判定基準: status = 'completed' （受講状況ページと同じ）
-- ===========================================

-- ステップ1: 既存の証明書を全て削除
DELETE FROM certificates;

-- ステップ2: コースを完了したユーザー・コースの組み合わせに対して証明書を再生成
-- コース内の全動画が status = 'completed' のユーザーのみが対象

INSERT INTO certificates (id, user_id, course_id, user_name, course_title, completion_date, is_active, created_at)
SELECT
  'CERT-' || EXTRACT(EPOCH FROM NOW())::bigint || '-' || UPPER(SUBSTRING(MD5(RANDOM()::text) FROM 1 FOR 7)) as id,
  completed.user_id,
  completed.course_id,
  COALESCE(up.display_name, up.email, 'ユーザー') as user_name,
  c.title as course_title,
  completed.completion_date,
  true as is_active,
  NOW() as created_at
FROM (
  -- 完了したユーザー・コースの組み合わせと完了日付
  SELECT
    vvl.user_id,
    vvl.course_id,
    MAX(COALESCE(vvl.completed_at, vvl.last_updated, vvl.created_at)) as completion_date
  FROM video_view_logs vvl
  WHERE vvl.status = 'completed'
  GROUP BY vvl.user_id, vvl.course_id
  HAVING COUNT(DISTINCT vvl.video_id) = (
    SELECT COUNT(v.id)
    FROM videos v
    WHERE v.course_id = vvl.course_id
  )
) completed
JOIN user_profiles up ON up.id = completed.user_id
JOIN courses c ON c.id = completed.course_id;

-- 結果を確認
SELECT
  id,
  user_name,
  course_title,
  completion_date,
  created_at
FROM certificates
ORDER BY completion_date DESC;
