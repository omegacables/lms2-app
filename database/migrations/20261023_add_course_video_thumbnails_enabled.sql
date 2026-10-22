-- 動画ごとのサムネイル（2026-10-23）
--
-- コースごとのスイッチ。ON のコースは、管理画面の動画管理で動画ごとにサムネイル画像（videos.thumbnail_url）を設定でき、
-- 受講者のコース画面の動画一覧と、プレイヤーの再生前の画面に表示する。OFF（既定）のコースは従来どおり表示しない。
-- 画像は thumbnails バケットの video-thumbnails/course-{コースID}/ に置く（/api/videos/[videoId]/thumbnail）。
-- stus-lms・axialms の両方に適用する（コードは共通）。

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS video_thumbnails_enabled BOOLEAN NOT NULL DEFAULT false;
