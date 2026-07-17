// 動画配信のベースURL。
// NEXT_PUBLIC_MEDIA_BASE_URL が設定されていれば、動画をそのドメイン（Cloudflare R2 の
// カスタムドメイン media.stus-lms.com 等）から直接配信する。未設定なら Supabase Storage の
// 署名付きURLにフォールバックする（＝env を外すだけで従来動作に完全ロールバックできる）。
//
// 背景: 2026-07、動画配信が Vercel 経由（社内フィルタ対策の /media/videos 中継）になり
// Fast Data Transfer が高騰した。R2（エグレス無料）へ逃がして転送費を削減する。
export const MEDIA_BASE_URL = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? '').replace(/\/+$/, '');

// Supabase の file_url から Storage 内のパス（例: course-5/xxx.mp4）を抽出する。
// public / sign / パスのみ、いずれの形式にも対応。抽出できなければ null。
export function extractStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const publicPrefix = `${supabaseUrl}/storage/v1/object/public/videos/`;
  const signedPrefix = `${supabaseUrl}/storage/v1/object/sign/videos/`;
  if (url.startsWith(publicPrefix)) return url.slice(publicPrefix.length);
  if (url.startsWith(signedPrefix)) return url.slice(signedPrefix.length).split('?')[0];
  if (!url.startsWith('http')) return url; // 既にパスのみ
  return null;
}

// Storage 内のパスを、外部配信URLに変換する。
// MEDIA_BASE_URL 未設定なら null（呼び出し側で従来の署名付きURLにフォールバック）。
export function buildMediaUrl(path: string): string | null {
  if (!MEDIA_BASE_URL) return null;
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${MEDIA_BASE_URL}/${encoded}`;
}
