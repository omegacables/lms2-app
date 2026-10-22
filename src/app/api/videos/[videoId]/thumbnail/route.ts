import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { requireRole } from '@/lib/auth/requireAdmin';
import { removeVideoAssetIfUnreferenced } from '@/lib/database/safeStorage';

/**
 * 動画ごとのサムネイル（管理者・講師）。
 * 受講者に表示するのは、コースの「動画ごとのサムネイル」（courses.video_thumbnails_enabled）が ON のときだけ。
 *
 * POST   multipart の thumbnail（JPEG/PNG/WebP・4MB まで。画面側で 1280px 幅の JPEG に縮めてから送る）
 * DELETE サムネイルを外す
 *
 * 画像は thumbnails バケットの video-thumbnails/course-{コースID}/ に置く。
 * 古い画像は、DB を書き換えたあとに「他の動画が使っていなければ」消す（コースのコピーは同じ画像を共有するため）。
 */

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
// Vercel の関数は 4.5MB を超えるリクエストを受け取れない
const MAX_BYTES = 4 * 1024 * 1024;

async function loadVideo(admin: ReturnType<typeof createAdminSupabaseClient>, videoId: string) {
  const id = parseInt(videoId);
  if (!id || isNaN(id)) return null;
  const { data } = await admin.from('videos').select('id, course_id, thumbnail_url').eq('id', id).maybeSingle();
  return data as { id: number; course_id: number; thumbnail_url: string | null } | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const { videoId } = await params;
  const admin = createAdminSupabaseClient();
  const video = await loadVideo(admin, videoId);
  if (!video) return NextResponse.json({ error: '動画が見つかりません' }, { status: 404 });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('thumbnail');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'サムネイル画像を選んでください' }, { status: 400 });
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: 'JPEG・PNG・WebP の画像を選んでください' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: '画像は4MB以下にしてください' }, { status: 400 });
  }

  const path = `video-thumbnails/course-${video.course_id}/video-${video.id}-${Date.now()}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from('thumbnails')
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    });
  if (uploadError) {
    console.error('[動画サムネイル] アップロード失敗:', uploadError.message);
    return NextResponse.json({ error: `画像のアップロードに失敗しました: ${uploadError.message}` }, { status: 500 });
  }
  const { data: urlData } = admin.storage.from('thumbnails').getPublicUrl(path);

  const { error: updateError } = await admin
    .from('videos')
    .update({ thumbnail_url: urlData.publicUrl, updated_at: new Date().toISOString() })
    .eq('id', video.id);
  if (updateError) {
    await admin.storage.from('thumbnails').remove([path]);
    return NextResponse.json({ error: `サムネイルを保存できませんでした: ${updateError.message}` }, { status: 500 });
  }

  if (video.thumbnail_url) {
    await removeVideoAssetIfUnreferenced(admin, {
      url: video.thumbnail_url,
      bucket: 'thumbnails',
      column: 'thumbnail_url',
      excludeVideoId: video.id,
      actor: { userId: auth.user.id, reason: 'replace' },
    }).catch((e) => console.warn('[動画サムネイル] 古い画像を消せませんでした:', e));
  }

  return NextResponse.json({ thumbnail_url: urlData.publicUrl });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const { videoId } = await params;
  const admin = createAdminSupabaseClient();
  const video = await loadVideo(admin, videoId);
  if (!video) return NextResponse.json({ error: '動画が見つかりません' }, { status: 404 });
  if (!video.thumbnail_url) return NextResponse.json({ thumbnail_url: null });

  const { error: updateError } = await admin
    .from('videos')
    .update({ thumbnail_url: null, updated_at: new Date().toISOString() })
    .eq('id', video.id);
  if (updateError) {
    return NextResponse.json({ error: `サムネイルを外せませんでした: ${updateError.message}` }, { status: 500 });
  }

  await removeVideoAssetIfUnreferenced(admin, {
    url: video.thumbnail_url,
    bucket: 'thumbnails',
    column: 'thumbnail_url',
    excludeVideoId: video.id,
    actor: { userId: auth.user.id, reason: 'delete' },
  }).catch((e) => console.warn('[動画サムネイル] 画像を消せませんでした:', e));

  return NextResponse.json({ thumbnail_url: null });
}
