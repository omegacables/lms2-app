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

// 配信（Cloudflare 経由の R2）は、ファイルごとの最初の範囲要求（Range）にだけファイル全体を
// 200 で返すことがある（2026-10-02 に media.stus-lms.com で確認。2回目以降の範囲要求は正しく 206）。
// Safari はその応答で再生に失敗し、他のブラウザでも途中からの読み直しに不利なので、
// <video> に渡す前に範囲要求を1回出して本文は受け取らずに切る（2回目以降の正しい応答で読ませる）。
// ※ Range ヘッダは no-cors では送られない（落とされる）ので通常の要求で送る。配信側の CORS 設定が無く
//   応答を読めなくても、要求自体は届くので目的は果たせる。失敗しても再生は続ける。最長 2.5 秒。
export async function warmUpMediaUrl(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith('http') || typeof fetch === 'undefined') return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-1' }, signal: ctrl.signal, cache: 'no-store' });
    await res.body?.cancel().catch(() => {});
  } catch {
    // CORS 不可・中断・失敗は無視
  } finally {
    clearTimeout(timer);
    ctrl.abort(); // 本文（最大でファイル全体）を受け取らないよう切る
  }
}
