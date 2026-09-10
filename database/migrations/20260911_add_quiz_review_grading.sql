-- ============================================================================
-- 選択式テストの「提出 → 添削」対応
-- ----------------------------------------------------------------------------
-- 背景：最終テストを記述式ではなく「選択式だが即時採点しない（提出して指導者が添削する）」
--       形式で運用したい。小テスト（即時採点）と区別するため、クイズごとに採点方式を持たせる。
--
--  * quizzes.grading_mode
--      'auto'   … 従来どおり回答時にサーバーが即時採点し、全問正解で通過（既定＝既存挙動）
--      'review' … 受講者は「提出」のみ。指導者が essay_reviews に添削を追記し、
--                 result='passed' で通過（記述式と同じ扱い）
--  * essay_reviews.question_reviews
--      設問ごとの添削（正誤＋コメント）を JSONB で保持。
--      [{ "question_id": 12, "is_correct": true, "comment": "…" }, ...]
--      essay_reviews は追記のみ（UPDATE/DELETE ポリシー無し）の方針を維持するため、
--      別テーブルではなく添削レコードに内包して1レコード=1回の添削とする。
-- ============================================================================

ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS grading_mode VARCHAR(20) NOT NULL DEFAULT 'auto'
    CHECK (grading_mode IN ('auto', 'review'));

COMMENT ON COLUMN quizzes.grading_mode IS
  'auto=回答時に即時採点（小テスト） / review=提出のみ・指導者が添削して合否を返す（最終テスト）。quiz_type=essay は常に review 相当';

-- 既存の記述式テストは常に「提出→添削」なので、値をそろえておく（挙動は変わらない）
UPDATE quizzes SET grading_mode = 'review' WHERE quiz_type = 'essay' AND grading_mode <> 'review';


ALTER TABLE essay_reviews
  ADD COLUMN IF NOT EXISTS question_reviews JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN essay_reviews.question_reviews IS
  '設問ごとの添削結果 [{question_id, is_correct, comment}]。選択式（grading_mode=review）の正誤付け・個別コメントに使用';

COMMENT ON TABLE essay_reviews IS
  '提出制テスト（記述式／選択式 grading_mode=review）の添削記録。追記のみ・指導者の関与記録';
