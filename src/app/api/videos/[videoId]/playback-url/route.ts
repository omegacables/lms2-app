import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/getUser';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { computeGateState } from '@/lib/quiz/gating';
import { extractStoragePath } from '@/lib/database/safeStorage';

export const runtime = 'nodejs';

// POST /api/videos/[videoId]/playback-url
// body: { access_token? }
// サーバーサイドゲート：直前までの動画完了＋配置済み小テスト全通過を検証し、
// 通過していれば署名付き再生URL（＋storageパス）を返す。未通過なら 403。
//
// 注意（配信方式の前提）:
//  - Supabase Storage の署名URL発行は本APIに集約し、storage RLS で受講者の自前発行を封じる。
//  - R2 公開CDN（NEXT_PUBLIC_MEDIA_BASE_URL）を使う構成では、videos.file_url を知る受講者が
//    CDNから直接バイトを取得できる余地が残る。完全封鎖にはR2側の署名/トークン配信が必要（別途）。
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const body = await request.json().catch(() => ({}));
  const { user, response } = await getAuthUser(request, body.access_token);
  if (!user) return response!;

  const { videoId } = await params;
  const vid = Number(videoId);
  const admin = createAdminSupabaseClient();

  const { data: video } = await admin
    .from('videos')
    .select('id, course_id, file_url, status')
    .eq('id', vid)
    .single();
  if (!video) {
    return NextResponse.json({ error: '動画が見つかりません' }, { status: 404 });
  }

  // 指導者／管理者はゲートをバイパス（プレビュー用）
  const { data: profile } = await admin
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const isStaff = profile?.role === 'admin' || profile?.role === 'instructor';

  if (!isStaff) {
    if (video.status !== 'active') {
      return NextResponse.json({ error: 'この動画は公開されていません', locked: true }, { status: 403 });
    }
    const state = await computeGateState(admin, user.id, video.course_id);
    const gate = state.videoUnlocked[vid];
    if (gate && !gate.unlocked) {
      // 最初の未通過ステップ（ロック解除に必要な対象）
      const pending = state.steps.find((s) => !s.passed) || null;
      return NextResponse.json(
        {
          error: `この動画はまだ視聴できません。先に${gate.reason || '前のステップ'}を完了してください。`,
          locked: true,
          reason: gate.reason,
          pending: pending
            ? { type: pending.type, id: pending.id, title: pending.title, quiz_type: pending.quiz_type }
            : null,
        },
        { status: 403 }
      );
    }
  }

  // ストレージ外の外部URL（外部リンク等）はゲート通過後そのまま返す
  const path = extractStoragePath(video.file_url, 'videos');
  if (!path) {
    return NextResponse.json({ allowed: true, signedUrl: video.file_url, path: null });
  }

  // R2（外部CDN）配信が設定されているか。設定時はクライアントが buildMediaUrl(path) で
  // R2 から直接再生するため、Supabase Storage に実ファイルが無くても再生できる。
  const mediaConfigured = !!(process.env.NEXT_PUBLIC_MEDIA_BASE_URL || '').trim();

  // 署名付きURLを発行（R2未設定＝Supabase配信のときの再生経路）
  const { data: signed, error: signError } = await admin.storage
    .from('videos')
    .createSignedUrl(path, 60 * 60 * 6); // 6時間

  if (signError || !signed) {
    // R2配信なら署名URLが取れなくてもOK（path を返してクライアントは R2 から再生）。
    // Supabase から動画を削除済みでも本番再生は維持される。
    if (mediaConfigured) {
      return NextResponse.json({ allowed: true, signedUrl: null, path });
    }
    return NextResponse.json(
      { error: '再生URLの発行に失敗しました', details: signError?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ allowed: true, signedUrl: signed.signedUrl, path });
}
