-- 受講者ごとの就業日・就業時間と、テスト実施記録の回答日の修正
--
-- テスト実施記録で、所定の就業日・就業時間の外に回答したテストの日付を赤字にするため、
-- 受講者ごとに定期的な出勤日（曜日）・就業時間と、日ごとの例外（休み・出勤・時間の変更）を持つ。
--
-- 回答日の修正は quiz_attempts（追記のみ・改ざん不可の回答ログ）を書き換えず、修正の記録を別表に追記する。
-- 実施記録には修正後の日付を載せ、元の回答日・修正者・修正日・理由も「回答日の修正記録」として載せる
-- （労働局へ出す証拠書類を事実どおりにしておくため）。
-- 読み書きは Route Handler（service role）のみ。受講者・講師のクライアントから直接は触らない。
--
-- 適用済み（2026-11-07）：stus-lms（20261106151943）・axialms（20261106152001）。本番では先頭に
-- set local lock_timeout = '5s'; を付けて実行した。

-- 定期的な出勤日・就業時間（受講者ごとに1行）
CREATE TABLE IF NOT EXISTS student_work_schedules (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  work_days    SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}', -- 出勤する曜日（0=日 1=月 … 6=土）
  start_time   TIME NOT NULL DEFAULT '09:00',
  end_time     TIME NOT NULL DEFAULT '18:00',             -- start_time より前なら日をまたぐ勤務
  holidays_off BOOLEAN NOT NULL DEFAULT true,             -- 祝日を休みにする
  updated_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 日ごとの例外（休み／出勤／就業時間の変更）
CREATE TABLE IF NOT EXISTS student_work_exceptions (
  id          SERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_date   DATE NOT NULL,
  is_workday  BOOLEAN NOT NULL,  -- true=出勤日（休みの曜日・祝日の出勤、時間の変更） false=休み
  start_time  TIME,              -- 出勤日の就業時間（NULL なら定期の就業時間）
  end_time    TIME,
  note        VARCHAR(200),
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, work_date)
);

-- 回答日の修正（追記のみ。同じ回答への最新の行が有効。corrected_date が NULL の行は「修正の取り消し」）
CREATE TABLE IF NOT EXISTS quiz_answer_date_corrections (
  id                SERIAL PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id           INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  answered_at       TIMESTAMP WITH TIME ZONE NOT NULL, -- 対象の回答（quiz_attempts.answered_at。1回の回答・提出は全設問が同じ値）
  original_date     DATE NOT NULL,                      -- 元の回答日（日本時間）
  corrected_date    DATE,                               -- 修正後の日付（NULL＝修正を取り消して元の日付に戻す）
  reason            TEXT NOT NULL,
  corrected_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  corrected_by_name VARCHAR(100),                       -- 修正した人の名前（修正時点のもの）
  corrected_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quiz_answer_date_corrections_user_quiz
  ON quiz_answer_date_corrections(user_id, quiz_id);

COMMENT ON TABLE student_work_schedules IS '受講者の定期の出勤日（0=日〜6=土）・就業時間。テスト実施記録で就業時間外の回答日を赤字にする';
COMMENT ON TABLE student_work_exceptions IS '就業日の例外（その日だけ休み・出勤・時間変更）';
COMMENT ON TABLE quiz_answer_date_corrections IS 'テスト実施記録の回答日の修正（追記のみ。最新行が有効、corrected_date NULL は取り消し）。quiz_attempts は書き換えない';

ALTER TABLE student_work_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_work_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_answer_date_corrections ENABLE ROW LEVEL SECURITY;
-- ポリシーは作らない（anon / authenticated からは読めない。API は service role で読み書きする）
REVOKE ALL ON student_work_schedules FROM anon, authenticated;
REVOKE ALL ON student_work_exceptions FROM anon, authenticated;
REVOKE ALL ON quiz_answer_date_corrections FROM anon, authenticated;
