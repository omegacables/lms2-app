-- stus-lms.com / axialms.com の両方に適用する。
-- iOSアプリ（受講者）が「管理者からのメッセージ」を既読にできるようにする。
-- Web はサーバーAPI（service_role）で既読化しているが、アプリは受講者の権限で
-- support_messages を直接 UPDATE するため、RLS で弾かれて既読にならなかった。

drop policy if exists "Students can mark admin messages read" on public.support_messages;
create policy "Students can mark admin messages read" on public.support_messages
  for update
  using (
    sender_type = 'admin'
    and exists (
      select 1 from public.support_conversations c
      where c.id = support_messages.conversation_id
        and c.student_id = (select auth.uid())
    )
  )
  with check (
    sender_type = 'admin'
    and exists (
      select 1 from public.support_conversations c
      where c.id = support_messages.conversation_id
        and c.student_id = (select auth.uid())
    )
  );

-- UPDATE で変更できる列を既読フラグ（is_read / read_at）だけに限定し、
-- 本文・送信者などの書き換えを防ぐ。Web・アプリの UPDATE は既読化のみ。
-- サーバー（service_role）の権限は変更しない。
revoke update on public.support_messages from anon, authenticated;
grant update (is_read, read_at) on public.support_messages to authenticated;
