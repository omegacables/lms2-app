-- 小テストの自動添削（AI の赤ペン・コメント）
--
-- 受講者が小テスト（grading_mode='auto'）に回答すると、AI が設問ごとの赤ペンとコメントを作成し、
-- 「自動添削（AI）」として受講者にすぐ表示する。講師が確認（必要なら修正）すると
-- confirmed_by / confirmed_at が入り、確認した講師の名前で署名が付く。
-- 講師が確認していない添削に講師名を付けない（訓練記録上、講師が添削したことになってしまうため）。
--
-- ai_question_reviews / ai_review_comment には AI が作成した元の内容を残し、
-- 講師が修正した場合も「AI の作成内容」と「講師が確認した内容」を区別できるようにする。
-- 読み書きは Route Handler（service role）のみ。受講者・講師のクライアントから直接は触らない。

CREATE TABLE IF NOT EXISTS quiz_auto_reviews (
  id                  SERIAL PRIMARY KEY,
  quiz_id             INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  -- 表示用（講師が修正したらその内容）: [{question_id, answer_text, comment, markup}]
  question_reviews    JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_comment      TEXT,
  -- AI が作成した元の内容
  ai_question_reviews JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_review_comment   TEXT,
  model               VARCHAR(100),
  error               TEXT,
  generated_at        TIMESTAMP WITH TIME ZONE,
  edited_at           TIMESTAMP WITH TIME ZONE,
  confirmed_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at        TIMESTAMP WITH TIME ZONE,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (quiz_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_auto_reviews_user ON quiz_auto_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_auto_reviews_unconfirmed ON quiz_auto_reviews(confirmed_at) WHERE confirmed_at IS NULL;

ALTER TABLE quiz_auto_reviews ENABLE ROW LEVEL SECURITY;
-- ポリシーは作らない（anon / authenticated からは読めない。API は service role で読み書きする）
REVOKE ALL ON quiz_auto_reviews FROM anon, authenticated;
