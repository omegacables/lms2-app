-- ============================================================================
-- セキュリティ修正: SMTP 認証情報の匿名公開 / quiz_questions_student ビューの権限
-- ----------------------------------------------------------------------------
-- 1. system_settings の「Allow anonymous read for maintenance check」ポリシー
--    USING (true) だったため、サイトの JS に含まれる anon キーだけで全設定
--    （email.smtp_password を含む）を誰でも読めた。
--    匿名で必要なのは middleware のメンテナンス判定（general.maintenance_mode）だけで、
--    SMTP 設定を使うのは管理画面（src/app/admin/settings/page.tsx）のみ。管理者は
--    管理者用ポリシーで引き続き読めるため、このポリシーから email.smtp_* を除外する。
--    ※ このポリシーが存在しないDBでは何もしない（新設はしない）。
--
-- 2. quiz_questions_student ビュー
--    security_invoker なしの自動更新可能ビューで、anon / authenticated に UPDATE / DELETE を
--    含む全権限が付いていた。ビュー経由の書き込みはビュー所有者（RLS をバイパス）の権限で
--    実行されるため、anon キーで quiz_questions を書き換え・削除でき、削除は quiz_attempts
--    （受講記録）へ CASCADE していた。アプリからは未使用のため権限をすべて剥奪する。
--    ※ 今後 public にビューを作る場合は security_invoker = true を付けるか、不要な権限を REVOKE すること。
-- ============================================================================

-- ---- 1. system_settings: 匿名読み取りから email.smtp_* を除外 ---------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'system_settings'
      AND policyname = 'Allow anonymous read for maintenance check'
  ) THEN
    DROP POLICY "Allow anonymous read for maintenance check" ON public.system_settings;
    CREATE POLICY "Allow anonymous read for maintenance check" ON public.system_settings
      FOR SELECT TO anon, authenticated
      USING (setting_key NOT LIKE 'email.smtp\_%');
  END IF;
END
$$;

-- ---- 2. quiz_questions_student: anon / authenticated の権限を剥奪 -----------
REVOKE ALL ON public.quiz_questions_student FROM anon, authenticated;
