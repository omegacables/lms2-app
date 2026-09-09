-- 修了証はユーザー×コースにつき1枚。
-- クライアント側の並行発行で同一 (user_id, course_id) の証明書が複数作られる事故があったため、
-- DB 制約で重複を防ぐ。アプリ側は 23505 (unique_violation) を「既に発行済み」として扱う。
--
-- 適用前に重複を解消しておくこと:
--   select user_id, course_id, count(*) from certificates group by 1,2 having count(*) > 1;
-- （本番 tjzdsiaehksqpxuvzqvp では 2026-09-09 に重複4件を削除のうえ適用済み）

ALTER TABLE public.certificates
  ADD CONSTRAINT certificates_user_course_unique UNIQUE (user_id, course_id);
