-- 会社ごとの設定（研修開始日・研修終了日）
--
-- 会社は受講者の会社名（user_profiles.company）でまとめているだけで、会社の表は無い。
-- そのため、会社名をキーにして、会社ごとの設定を1行で持つ。
-- 研修開始日・研修終了日はどちらも任意（NULL＝未設定）。両方が未設定になった会社は行ごと消す。
--
-- 会社名の変更・統合（/api/admin/companies/rename）と会社の削除（/api/admin/companies/delete）のとき、
-- この表の行も合わせて直す。
-- 読み書きは Route Handler（service role）のみ。受講者・講師のクライアントから直接は触らない。
-- この表が無くても、生徒管理の画面はこれまでどおり動く（研修期間が出ないだけ）。
--
-- 適用済み（2026-11-11）：stus-lms（20261111034714）・axialms（20261111034721）。本番では先頭に
-- set local lock_timeout = '5s'; を付けて実行した。

CREATE TABLE IF NOT EXISTS company_settings (
  company             TEXT PRIMARY KEY,           -- user_profiles.company と同じ文字列
  training_start_date DATE,                       -- 研修開始日（任意）
  training_end_date   DATE,                       -- 研修終了日（任意）
  updated_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT company_settings_training_period_order
    CHECK (training_start_date IS NULL OR training_end_date IS NULL OR training_start_date <= training_end_date)
);

COMMENT ON TABLE company_settings IS '会社ごとの設定（研修開始日・研修終了日。どちらも任意）。キーは user_profiles.company の会社名';

ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
-- ポリシーは作らない（anon / authenticated からは読めない。API は service role で読み書きする）
REVOKE ALL ON company_settings FROM anon, authenticated;
