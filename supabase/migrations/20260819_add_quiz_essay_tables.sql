-- ============================================================================
-- 通信制対応：小テスト（設問回答）・記述式最終テスト（添削指導）テーブル追加
-- ----------------------------------------------------------------------------
-- 設計方針
--  * 回答ログ（quiz_attempts）・添削（essay_reviews）は「追記のみ」。
--    UPDATE / DELETE ポリシーは付与しない（labor局調査に耐える改ざん不可の記録）。
--  * 受講者は quiz_questions を直接 SELECT できない（correct_index / explanation の
--    漏洩防止）。設問の配信・採点は必ずサーバー側（Route Handler + service role）で行い、
--    正答・解説を含まないフィールドのみ返す。安全のためのビュー quiz_questions_student も用意。
--  * 書き込み系ロジック（採点・ゲート制御・添削確定）は Route Handler で service role により実行する。
--    RLS の INSERT ポリシーは多層防御として定義するが、通常経路はサーバー側。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. courses への追加カラム（コース設定 / 労働局提出帳票のヘッダー用）
-- ----------------------------------------------------------------------------
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS standard_learning_minutes INTEGER,          -- 標準学習時間（分）
  ADD COLUMN IF NOT EXISTS standard_learning_period  VARCHAR(100),     -- 標準学習期間（自由記述）
  ADD COLUMN IF NOT EXISTS test_required             BOOLEAN DEFAULT false NOT NULL, -- テスト必須フラグ
  ADD COLUMN IF NOT EXISTS training_type_note        TEXT;             -- 訓練区分メモ（自由記述）

COMMENT ON COLUMN courses.standard_learning_minutes IS '標準学習時間（分）。受講一覧CSV・実施記録PDFのヘッダーに表示';
COMMENT ON COLUMN courses.standard_learning_period  IS '標準学習期間（例：約1ヶ月）';
COMMENT ON COLUMN courses.test_required             IS 'true の場合、全小テスト通過＋最終テスト提出＋添削合格を修了条件に追加する。既存コースは false のまま挙動不変';
COMMENT ON COLUMN courses.training_type_note        IS '訓練区分に関する自由記述メモ';

-- ----------------------------------------------------------------------------
-- 2. quizzes：小テスト / 最終テストの定義
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quizzes (
  id            SERIAL PRIMARY KEY,
  course_id     INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  after_video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE, -- この動画の直後に配置。NULL ならコース末
  title         VARCHAR(200) NOT NULL,
  quiz_type     VARCHAR(20) NOT NULL DEFAULT 'choice'
                  CHECK (quiz_type IN ('choice', 'essay')), -- choice=選択式小テスト / essay=記述式最終テスト
  pass_policy   VARCHAR(20) NOT NULL DEFAULT 'all_correct'
                  CHECK (pass_policy IN ('all_correct')),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  status        VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'published')),
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_course        ON quizzes(course_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_after_video   ON quizzes(after_video_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_course_status ON quizzes(course_id, status);

-- ----------------------------------------------------------------------------
-- 3. quiz_questions：設問（correct_index / explanation は受講者に非公開）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quiz_questions (
  id            SERIAL PRIMARY KEY,
  quiz_id       INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  choices       JSONB NOT NULL DEFAULT '[]'::jsonb, -- 選択式：4択の配列。記述式：[] でよい
  correct_index INTEGER,                            -- 選択式のみ。0始まり。記述式は NULL
  explanation   TEXT,                               -- 不正解時に表示する解説（受講者に直接SELECTさせない）
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id, sort_order);

-- ----------------------------------------------------------------------------
-- 4. quiz_attempts：回答ログ（追記のみ）
--    再挑戦は attempt_no を増やして新規行を追加する。UPDATE/DELETE は行わない。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id             SERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id        INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_id    INTEGER NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  selected_index INTEGER,   -- 選択式：受講者が選んだ選択肢（0始まり）
  answer_text    TEXT,      -- 記述式：受講者の記述回答
  is_correct     BOOLEAN,   -- 選択式：採点結果。記述式は NULL（添削で評価）
  attempt_no     INTEGER NOT NULL DEFAULT 1, -- 同一設問への挑戦回数（1始まり）
  answered_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_quiz     ON quiz_attempts(user_id, quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_question ON quiz_attempts(user_id, question_id, attempt_no);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz          ON quiz_attempts(quiz_id);

-- ----------------------------------------------------------------------------
-- 5. essay_reviews：記述式最終テストの添削（追記のみ・指導者の関与記録）
--    再添削（要再提出→再提出）は新規行を追加して履歴を残す。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS essay_reviews (
  id             SERIAL PRIMARY KEY,
  quiz_id        INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- 受講者
  reviewer_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL, -- 添削した指導者
  review_comment TEXT,
  result         VARCHAR(20) NOT NULL
                   CHECK (result IN ('passed', 'needs_revision')),
  ai_assisted    BOOLEAN DEFAULT false, -- AI下書き支援を使ったか（最終確定は必ず指導者操作）
  reviewed_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_essay_reviews_user_quiz ON essay_reviews(user_id, quiz_id);
CREATE INDEX IF NOT EXISTS idx_essay_reviews_reviewer  ON essay_reviews(reviewer_id);

-- ----------------------------------------------------------------------------
-- 6. 受講者向けの安全なビュー（正答・解説を含まない）
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW quiz_questions_student AS
  SELECT id, quiz_id, question_text, choices, sort_order, created_at
  FROM quiz_questions;

-- ----------------------------------------------------------------------------
-- 7. updated_at 自動更新トリガー
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_quizzes_updated_at ON quizzes;
CREATE TRIGGER update_quizzes_updated_at BEFORE UPDATE ON quizzes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_quiz_questions_updated_at ON quiz_questions;
CREATE TRIGGER update_quiz_questions_updated_at BEFORE UPDATE ON quiz_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE quizzes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE essay_reviews  ENABLE ROW LEVEL SECURITY;

-- ---- quizzes ---------------------------------------------------------------
-- 受講者：公開済みのクイズ定義（タイトル・種別・配置）は閲覧可（設問の中身は含まれない）
DROP POLICY IF EXISTS "Published quizzes visible to authenticated" ON quizzes;
CREATE POLICY "Published quizzes visible to authenticated" ON quizzes
  FOR SELECT TO authenticated
  USING (status = 'published');

-- 指導者／管理者：全操作可
DROP POLICY IF EXISTS "Instructors and admins manage quizzes" ON quizzes;
CREATE POLICY "Instructors and admins manage quizzes" ON quizzes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('instructor', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('instructor', 'admin'))
  );

-- ---- quiz_questions --------------------------------------------------------
-- 受講者への直接 SELECT は許可しない（正答・解説の漏洩防止）。
-- 指導者／管理者のみ全操作可。受講者への配信は API（service role）経由。
DROP POLICY IF EXISTS "Instructors and admins manage quiz_questions" ON quiz_questions;
CREATE POLICY "Instructors and admins manage quiz_questions" ON quiz_questions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('instructor', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('instructor', 'admin'))
  );

-- ---- quiz_attempts（追記のみ）----------------------------------------------
-- 受講者：自分の回答のみ INSERT / SELECT 可（UPDATE/DELETE ポリシーは付与しない）
DROP POLICY IF EXISTS "Users insert own attempts" ON quiz_attempts;
CREATE POLICY "Users insert own attempts" ON quiz_attempts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own attempts" ON quiz_attempts;
CREATE POLICY "Users view own attempts" ON quiz_attempts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 指導者／管理者：全 SELECT 可（回答状況一覧・実施記録用）
DROP POLICY IF EXISTS "Instructors and admins view all attempts" ON quiz_attempts;
CREATE POLICY "Instructors and admins view all attempts" ON quiz_attempts
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('instructor', 'admin'))
  );

-- ---- essay_reviews（追記のみ）----------------------------------------------
-- 受講者：自分宛ての添削結果を SELECT 可
DROP POLICY IF EXISTS "Users view own essay reviews" ON essay_reviews;
CREATE POLICY "Users view own essay reviews" ON essay_reviews
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 指導者／管理者：SELECT / INSERT 可（UPDATE/DELETE ポリシーは付与しない＝追記のみ）
DROP POLICY IF EXISTS "Instructors and admins view essay reviews" ON essay_reviews;
CREATE POLICY "Instructors and admins view essay reviews" ON essay_reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('instructor', 'admin'))
  );

DROP POLICY IF EXISTS "Instructors and admins insert essay reviews" ON essay_reviews;
CREATE POLICY "Instructors and admins insert essay reviews" ON essay_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = reviewer_id
    AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('instructor', 'admin'))
  );

-- ---- quiz_questions_student ビューへの権限 ---------------------------------
GRANT SELECT ON quiz_questions_student TO authenticated;
