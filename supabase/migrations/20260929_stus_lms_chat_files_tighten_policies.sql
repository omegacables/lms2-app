-- stus-lms.com（LMS / tjzdsiaehksqpxuvzqvp）専用。
-- チャット添付ファイル（chat-files バケット）の権限を必要最小限にする。
-- （axialms は 20260929_axialms_align_support_chat_schema.sql で最初から同等の設定）

-- 誰でも添付ファイルの一覧を取得できる状態を解消する。
-- ファイルは公開URLで表示しているため、閲覧には影響しない。
drop policy if exists "Anyone can view chat files" on storage.objects;

-- 削除は自分がアップロードしたファイルだけにする（従来はログイン中なら誰のファイルでも削除できた）。
drop policy if exists "Users can delete own chat files" on storage.objects;
create policy "Users can delete own chat files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-files' and owner_id = (select auth.uid())::text);
