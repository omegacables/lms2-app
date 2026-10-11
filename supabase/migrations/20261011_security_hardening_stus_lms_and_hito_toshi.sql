-- 2026-10-11 セキュリティ是正（stus-lms tjzdsiaehksqpxuvzqvp / hito-toshi btxlrrjcifynhnujsgyf に適用済み）
-- 監査: セキュリティ監査_2026-10-11.md / 対応手順_2026-10-11.md フェーズ3
SET LOCAL lock_timeout = '5s';

-- (a) system_settings: 全件 anon 読み（SMTP パスワード含む）をやめ、必要なものだけ許可
DROP POLICY IF EXISTS "Allow anonymous read for maintenance check" ON public.system_settings;
CREATE POLICY "Anon can read maintenance flag and certificate settings"
  ON public.system_settings FOR SELECT TO anon, authenticated
  USING (setting_key = 'general.maintenance_mode' OR setting_key LIKE 'certificate.%' OR is_public = true);

-- (b) quiz_questions_student ビュー: anon/authenticated の INSERT/UPDATE/DELETE を剥奪（RLS 迂回で全問題削除が可能だった）
DO $x$ BEGIN
  IF to_regclass('public.quiz_questions_student') IS NOT NULL THEN
    REVOKE ALL ON public.quiz_questions_student FROM anon, authenticated;
    ALTER VIEW public.quiz_questions_student SET (security_invoker = true);
  END IF;
END $x$;

-- (c) 動画・コースを未ログイン（anon）から隠す。authenticated 用ポリシーは既存（Allow authenticated users to read active videos）
DROP POLICY IF EXISTS "Videos visible to all users" ON public.videos;
DROP POLICY IF EXISTS "Active courses visible to all users" ON public.courses;
CREATE POLICY "Active courses visible to authenticated users"
  ON public.courses FOR SELECT TO authenticated USING (status = 'active');

-- (h) hito-toshi のみ: 受講者が全ユーザーの氏名・メールを読めるポリシーを削除（stus-lms は 2026-10-02 に削除済み）
DROP POLICY IF EXISTS "Allow authenticated users to view all profiles" ON public.user_profiles;

-- (d) company も受講者本人には変更させない（社労士の閲覧範囲が company で決まるため）
CREATE OR REPLACE FUNCTION public.protect_privileged_profile_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = 'admin') THEN RETURN NEW; END IF;
  NEW.role := OLD.role;
  NEW.is_active := OLD.is_active;
  NEW.can_skip_videos := OLD.can_skip_videos;
  NEW.company := OLD.company;
  RETURN NEW;
END $f$;

-- (e) 受講者本人による偽造経路（アプリは service role でしか書かない）
DROP POLICY IF EXISTS "Users insert own attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "System can create completions" ON public.course_completions;

-- (f) 動画削除で後続の小テスト・解答・添削が連鎖削除されないように
ALTER TABLE public.quizzes DROP CONSTRAINT quizzes_after_video_id_fkey;
ALTER TABLE public.quizzes ADD CONSTRAINT quizzes_after_video_id_fkey
  FOREIGN KEY (after_video_id) REFERENCES public.videos(id) ON DELETE SET NULL;
