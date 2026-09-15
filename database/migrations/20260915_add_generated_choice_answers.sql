-- ============================================================================
-- 選択式テストの「回答文生成」対応
-- ----------------------------------------------------------------------------
-- 選択肢を固定の短文ではなく、受講者が書いたような文章（回答文）として毎回生成して提示する。
-- 同じ内容でも言い回しが毎回変わるため、選択肢の文言や位置を覚えて答えることができず、
-- 受講者は中身を読んで判断する必要がある。
--
--  * quizzes.answer_style
--      'plain'     … 従来どおり quiz_questions.choices をそのまま表示（既定）
--      'generated' … choices を「回答パターン（要旨）」として扱い、受講ごとに回答文を生成して提示
--  * quiz_choice_sets
--      受講者ごと・受験ごとに生成して提示した回答文の組。どの表示位置がどのパターンだったかを
--      サーバー側だけで保持する（正答の対応は受講者に渡さない）。提出時に consumed_at を記録。
--      何が提示されたかの記録にもなる（generator に生成方法を残す）。
--  * quiz_attempts.choice_set_id
--      その回答がどの提示セットから選ばれたか。answer_text には選んだ回答文そのものを保存する。
-- ============================================================================

ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS answer_style VARCHAR(20) NOT NULL DEFAULT 'plain'
    CHECK (answer_style IN ('plain', 'generated'));

COMMENT ON COLUMN quizzes.answer_style IS
  'plain=選択肢をそのまま表示 / generated=選択肢を回答パターンとして扱い、受験ごとに回答文を生成して提示（選択式のみ）';

CREATE TABLE IF NOT EXISTS quiz_choice_sets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id      INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  -- { "<question_id>": [ { "pattern_index": 2, "text": "…" }, ... ] }  配列の並び＝表示順
  options      JSONB NOT NULL,
  generator    VARCHAR(100),               -- 例: gemini-2.5-flash / fallback
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  consumed_at  TIMESTAMP WITH TIME ZONE    -- 提出（回答）に使われた日時
);

CREATE INDEX IF NOT EXISTS idx_quiz_choice_sets_user_quiz ON quiz_choice_sets(user_id, quiz_id, consumed_at);

COMMENT ON TABLE quiz_choice_sets IS
  '受験ごとに生成して提示した回答文（選択肢）の組。表示位置と回答パターンの対応はサーバー側のみで保持';

ALTER TABLE quiz_choice_sets ENABLE ROW LEVEL SECURITY;

-- 受講者には直接見せない（パターンの対応＝正答が分かるため）。読み書きは Route Handler + service role。
DROP POLICY IF EXISTS "Instructors and admins view choice sets" ON quiz_choice_sets;
CREATE POLICY "Instructors and admins view choice sets" ON quiz_choice_sets
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('instructor', 'admin'))
  );

ALTER TABLE quiz_attempts
  ADD COLUMN IF NOT EXISTS choice_set_id UUID REFERENCES quiz_choice_sets(id) ON DELETE SET NULL;

COMMENT ON COLUMN quiz_attempts.choice_set_id IS
  '回答文生成（answer_style=generated）の場合、どの提示セットから選んだか。answer_text に選んだ回答文を保存';
