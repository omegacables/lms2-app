import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { requireRole } from '@/lib/auth/requireAdmin';
import { removeVideoAssetIfUnreferenced } from '@/lib/database/safeStorage';

/**
 * 動画ファイルの後片付け用エンドポイント（管理者・講師用）。
 * クライアント側で動画を置き換えた後、古いファイルを「他レコードが参照していない場合のみ」削除する。
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
  // 呼び出し時点で対象レコードは既に新URLへ更新済みのため、除外IDは不要（-1）
  const result = await removeVideoAssetIfUnreferenced(admin, {
    url: fileUrl,
    bucket: 'videos',
    column: 'file_url',
    excludeVideoId: -1,
  });

  return NextResponse.json({ success: true, ...result });
}
