-- 2026-10-11 セキュリティ是正（axialms ewtnyhfizuyvzvxkllva に適用済み）
-- axialms には system_settings の anon 全件ポリシーが無く、videos の authenticated 用ポリシーも無いため stus-lms 版と内容が異なる
SET LOCAL lock_timeout = '5s';

-- (b) quiz_questions_student ビュー
REVOKE ALL ON public.quiz_questions_student FROM anon, authenticated;
ALTER VIEW public.quiz_questions_student SET (security_invoker = true);

-- (c) 動画・コースを未ログインから隠す（authenticated 用を作り直す）
DROP POLICY IF EXISTS "Videos visible to all users" ON public.videos;
CREATE POLICY "Videos visible to authenticated users"
  ON public.videos FOR SELECT TO authenticated
  USING (status = 'active' AND EXISTS (SELECT 1 FROM public.courses c WHERE c.id = videos.course_id AND c.status = 'active'));
DROP POLICY IF EXISTS "Active courses visible to all users" ON public.courses;
CREATE POLICY "Active courses visible to authenticated users"
  ON public.courses FOR SELECT TO authenticated USING (status = 'active');

-- (d) company の保護
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

-- (e) 偽造経路
DROP POLICY IF EXISTS "Users insert own attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "System can create completions" ON public.course_completions;

-- (g) notifications: 誰でも INSERT できるポリシーを削除（service role は RLS を通らない）
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

-- (f) 動画削除の連鎖
ALTER TABLE public.quizzes DROP CONSTRAINT quizzes_after_video_id_fkey;
ALTER TABLE public.quizzes ADD CONSTRAINT quizzes_after_video_id_fkey
  FOREIGN KEY (after_video_id) REFERENCES public.videos(id) ON DELETE SET NULL;
