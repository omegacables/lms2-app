-- ============================================================================
-- 通信制対応（Phase 2）：videos バケットの署名URL自前発行を封じる
-- ----------------------------------------------------------------------------
-- 目的: 受講者がブラウザから supabase.storage.from('videos').createSignedUrl() を
--   直接叩いて再生URLを取得する経路を塞ぐ。再生URLの発行は必ずゲートAPI
--   （/api/videos/[videoId]/playback-url, service role）経由に一本化する。
--
-- 影響:
--   * service role（API）は RLS をバイパスするため、ゲートAPIの署名URL発行は動作する。
--   * instructor / admin はプレビュー等で直接発行する画面があるため SELECT を許可。
--   * 受講者クライアントは createSignedUrl が使えなくなる → プレイヤーはゲートAPIを使うよう改修済み。
--
-- ロールバック:
--   DROP POLICY "Staff can view videos" ON storage.objects;
--   CREATE POLICY "Users can view videos" ON storage.objects FOR SELECT USING (bucket_id = 'videos');
--
-- 注意: R2 公開CDN（NEXT_PUBLIC_MEDIA_BASE_URL）配信構成では、videos.file_url を知る
--   受講者がCDNから直接バイト取得できる余地が残る。完全封鎖にはR2側の署名/トークン配信が必要。
-- ============================================================================

DROP POLICY IF EXISTS "Users can view videos" ON storage.objects;

DROP POLICY IF EXISTS "Staff can view videos" ON storage.objects;
CREATE POLICY "Staff can view videos" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'videos'
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('instructor', 'admin', 'labor_consultant')
    )
  );
