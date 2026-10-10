-- axialms.com（Supabase: LMS_Akiba / ewtnyhfizuyvzvxkllva）専用。
-- サポートチャットのスキーマを stus-lms.com（LMS / tjzdsiaehksqpxuvzqvp）と揃える。
--
-- 背景: axialms の support_messages に sender_type 等が無く、Web・iOSアプリの
-- メッセージ送信／未読取得がすべて 400 で失敗していた（会話17件・メッセージ0件）。
-- 既存データは変更しない（列・制約・ポリシーの追加と、送信ポリシーの厳格化のみ）。
-- 社労士（labor_consultant）向けポリシーは axialms に該当テーブルが無いため対象外。

-- 1) support_messages: 不足している列
alter table public.support_messages
  add column if not exists sender_type text,
  add column if not exists read_at timestamptz,
  add column if not exists file_url text,
  add column if not exists file_name varchar(255),
  add column if not exists file_type varchar(100),
  add column if not exists file_size integer;

-- 既存行（適用時点で0件）の送信者種別を補完してから必須にする
update public.support_messages m
set sender_type = case
  when exists (
    select 1 from public.support_conversations c
    where c.id = m.conversation_id and c.student_id = m.sender_id
  ) then 'student'
  else 'admin'
end
where m.sender_type is null;

alter table public.support_messages alter column sender_type set not null;
alter table public.support_messages drop constraint if exists support_messages_sender_type_check;
alter table public.support_messages add constraint support_messages_sender_type_check
  check (sender_type = any (array['student'::text, 'admin'::text]));

-- 2) support_conversations: 不足している列と「解決済み」ステータス
alter table public.support_conversations
  add column if not exists resolved_at timestamptz,
  add column if not exists assigned_to uuid references auth.users(id);

alter table public.support_conversations drop constraint if exists support_conversations_status_check;
alter table public.support_conversations add constraint support_conversations_status_check
  check ((status)::text = any (array['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text]));

-- 3) インデックス
create index if not exists idx_support_conversations_assigned on public.support_conversations (assigned_to);
create index if not exists idx_support_messages_unread on public.support_messages (is_read) where (is_read = false);

-- 4) メッセージ送信時に会話の updated_at を更新する
create or replace function public.update_conversation_timestamp()
returns trigger
language plpgsql
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
begin
    update support_conversations
    set updated_at = now()
    where id = new.conversation_id;
    return new;
end;
$function$;

drop trigger if exists update_conversation_on_message on public.support_messages;
create trigger update_conversation_on_message
  after insert on public.support_messages
  for each row execute function public.update_conversation_timestamp();

-- 5) RLS ポリシー
-- 受講者は自分の会話を更新できる（再オープン・送信時の updated_at 更新）
drop policy if exists "Students can update own conversations" on public.support_conversations;
create policy "Students can update own conversations" on public.support_conversations
  for update using ((select auth.uid()) = student_id);

-- 管理者は全メッセージを管理できる（既読化など）
drop policy if exists "Admins can manage all support messages" on public.support_messages;
create policy "Admins can manage all support messages" on public.support_messages
  for all using (get_my_role() = 'admin'::text);

-- 送信は「自分の会話の受講者」か「管理者」のみ（従来は sender_id の一致だけで、他人の会話にも書き込めた）
drop policy if exists "Users can send messages" on public.support_messages;
create policy "Users can send messages" on public.support_messages
  for insert with check (
    (select auth.uid()) = sender_id
    and exists (
      select 1 from public.support_conversations c
      where c.id = support_messages.conversation_id
        and (c.student_id = (select auth.uid()) or get_my_role() = 'admin'::text)
    )
  );

-- 6) チャットの添付ファイル用バケット（公開URLで表示。一覧取得・削除の権限は付けない）
insert into storage.buckets (id, name, public)
values ('chat-files', 'chat-files', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can upload chat files" on storage.objects;
create policy "Authenticated users can upload chat files" on storage.objects
  for insert to authenticated with check (bucket_id = 'chat-files');
