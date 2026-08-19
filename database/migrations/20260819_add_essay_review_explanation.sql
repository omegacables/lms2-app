-- ============================================================================
-- 通信制対応（追加）：記述式最終テストの添削に「解説」列を追加
-- ----------------------------------------------------------------------------
-- 添削指導は正誤だけでなく解説が付いている必要があるため、essay_reviews に
-- explanation（解説）を追加する。既存の review_comment=添削コメント、
-- explanation=解説（模範解答の要点等）として使い分ける。
-- 追記型の方針は変更なし（UPDATE/DELETE ポリシーは付与しない）。
-- ============================================================================

ALTER TABLE essay_reviews
  ADD COLUMN IF NOT EXISTS explanation TEXT;

COMMENT ON COLUMN essay_reviews.explanation IS '添削の解説（模範解答の要点など）。review_comment=添削コメントとは別に保持';

-- スキーマキャッシュ再読込（Supabase / PostgREST）
NOTIFY pgrst, 'reload schema';
