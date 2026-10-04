import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { requireRole } from '@/lib/auth/requireAdmin';
import { removeVideoAssetIfUnreferenced } from '@/lib/database/safeStorage';

/**
 * 動画ファイルの後片付け用エンドポイント（管理者・講師用）。
 * クライアント側で動画を置き換えた後、古いファイルを「他レコードが参照していない場合のみ」削除する。
 * Supabase Storage（旧保存先）と Cloudflare R2（配信元）の両方から消し、system_logs に記録する。
 * コース複製で共有されたファイルを誤って消さないための参照カウントをサーバー側で行う。
 * ※ 動画の置き換え/削除APIが instructor も許可しているため、ここも同じロール範囲にする
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 });
  }

  const fileUrl: string | undefined = body?.file_url;
  if (!fileUrl) {
    return NextResponse.json({ error: 'file_url が必要です' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  // 呼び出し時点で対象レコードは既に新しいファイルへ更新済み。video_id は記録用（無ければ -1）
  const videoId = Number.isInteger(Number(body?.video_id)) && Number(body.video_id) > 0 ? Number(body.video_id) : -1;
  const result = await removeVideoAssetIfUnreferenced(admin, {
    url: fileUrl,
    bucket: 'videos',
    column: 'file_url',
    excludeVideoId: videoId,
    actor: { userId: auth.user.id, reason: 'replace' },
  });

  return NextResponse.json({ success: true, ...result });
}
