-- AI講師（自動添削の署名に使う名前）
--
-- 小テスト・最終テストは、回答・提出の直後に AI講師が自動で添削して返却する。
-- 署名は必ず「AI講師　{名前}」と表示し、人の講師が添削したものと区別する（訓練記録上の誤認を防ぐため）。
-- AI講師は小テスト管理から最大5名まで登録し、コースごとに添削を担当する AI講師を選ぶ。

CREATE TABLE IF NOT EXISTS ai_instructors (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50) NOT NULL,
  title       VARCHAR(100),          -- 肩書き（任意）
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE ai_instructors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_instructors FROM anon, authenticated;

-- コースごとの担当 AI講師（未設定なら最初に登録した AI講師）
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS ai_instructor_id INTEGER REFERENCES ai_instructors(id) ON DELETE SET NULL;

-- 小テストの自動添削: 添削した AI講師（名前は添削時点のものを残す）
ALTER TABLE quiz_auto_reviews
  ADD COLUMN IF NOT EXISTS ai_instructor_id INTEGER REFERENCES ai_instructors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_instructor_name VARCHAR(100);

-- 最終テストの添削: AI講師による自動添削は reviewer_id を持たない（人の講師の添削は従来どおり reviewer_id 必須）
ALTER TABLE essay_reviews ALTER COLUMN reviewer_id DROP NOT NULL;
ALTER TABLE essay_reviews
  ADD COLUMN IF NOT EXISTS auto_reviewed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_instructor_id INTEGER REFERENCES ai_instructors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_instructor_name VARCHAR(100);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'essay_reviews_reviewer_or_auto') THEN
    ALTER TABLE essay_reviews
      ADD CONSTRAINT essay_reviews_reviewer_or_auto CHECK (reviewer_id IS NOT NULL OR auto_reviewed);
  END IF;
END $$;
