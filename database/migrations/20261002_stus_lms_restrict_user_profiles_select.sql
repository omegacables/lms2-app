-- stus-lms.com（LMS / tjzdsiaehksqpxuvzqvp）専用。
-- user_profiles を「ログイン中なら誰でも全員分読める」状態から、本人・管理者・担当の社労士だけが読める状態にする。
-- （axialms は最初から本人と管理者だけ。labor_consultant_companies も無いので適用しない）
--
-- 削除するポリシー "Allow authenticated users to view all profiles"（USING auth.role() = 'authenticated'）のため、
-- 受講者でも anon キーで全ユーザーの氏名・メール・会社・ロールを取得できていた。
--
-- 社労士の画面（Web の labor-consultant/dashboard・learning-logs・certificates と MainLayout の未読件数、
-- iOS アプリの社労士画面）はブラウザ／アプリから担当会社の受講者のプロフィールを直接読む。
-- また video_view_logs・certificates・course_completions・course_enrollments・support_conversations・
-- support_messages の社労士用ポリシーも user_profiles を JOIN して受講者の会社を確かめている。
-- どちらも上のポリシーで読めていたので、「社労士は担当会社の受講者だけ読める」ポリシーを先に作ってから削除する。

-- ログイン中の社労士の担当会社。
-- user_profiles のポリシーから labor_consultant_companies を直接参照すると、labor_consultant_companies 側の
-- ポリシーが user_profiles を参照しているため無限再帰になる（2025-11-17 に
-- fix_infinite_recursion_remove_labor_policies で社労士用ポリシーを外した原因）。
-- SECURITY DEFINER（所有者 postgres は BYPASSRLS）で RLS を通さずに読む。
-- /rest/v1/rpc から呼べないよう、API に公開していない private スキーマに置く。
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.labor_consultant_assigned_companies()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct lcc.company::text
  from public.labor_consultant_companies lcc
  join public.user_profiles me on me.id = lcc.labor_consultant_id
  where lcc.labor_consultant_id = (select auth.uid())
    and me.role = 'labor_consultant'
    and btrim(lcc.company) <> '';
$$;

revoke all on function private.labor_consultant_assigned_companies() from public, anon;
grant execute on function private.labor_consultant_assigned_companies() to authenticated;

-- 社労士は担当会社の受講者のプロフィールだけ読める（自分の分は "Users can view own profile"）。
-- 相関のないサブクエリなので、関数はクエリごとに1回だけ評価される。
drop policy if exists "Labor consultants can view assigned company students" on public.user_profiles;
create policy "Labor consultants can view assigned company students" on public.user_profiles
  for select to authenticated
  using (
    role = 'student'
    and company::text in (select private.labor_consultant_assigned_companies())
  );

-- 全員分を読めるポリシーを削除する。残る SELECT ポリシーは
-- "Users can view own profile"・"Admins can view all profiles"・上の社労士用の3つ。
drop policy if exists "Allow authenticated users to view all profiles" on public.user_profiles;

-- 元に戻す場合:
--   create policy "Allow authenticated users to view all profiles" on public.user_profiles
--     for select using ((select auth.role()) = 'authenticated');
--   drop policy if exists "Labor consultants can view assigned company students" on public.user_profiles;
--   drop function if exists private.labor_consultant_assigned_companies();
