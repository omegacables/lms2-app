import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteR2Object, type R2DeleteResult } from '@/lib/storage/r2';

/**
 * 保存済み URL からストレージ内のパスを抽出する。
 * public / sign いずれの形式にも対応し、既にパスのみの場合はそのまま返す。
 */
export function extractStoragePath(
  url: string | null | undefined,
  bucket: string
): string | null {
  if (!url) return null;
  const publicMarker = `/storage/v1/object/public/${bucket}/`;
  const signMarker = `/storage/v1/object/sign/${bucket}/`;
  if (url.includes(publicMarker)) return url.split(publicMarker)[1] || null;
  if (url.includes(signMarker)) return (url.split(signMarker)[1] || '').split('?')[0] || null;
  if (!url.startsWith('http')) return url; // 既にパスのみ
  return null;
}

/**
 * 同じファイル（パス）を参照している他の videos レコードの数。
 * URL の書き方（public / sign / パスのみ）が違っても、同じパスなら共有とみなす。
 * 照会に失敗したら null（呼び出し側は安全側に倒して削除しない）。
 */
async function countOtherReferences(
  admin: SupabaseClient,
  params: { path: string; bucket: string; column: 'file_url' | 'thumbnail_url'; excludeVideoId: number | string }
): Promise<number | null> {
  const { path, bucket, column, excludeVideoId } = params;
  // LIKE の _ は1文字のワイルドカードなので候補を広めに取り、パスを取り出して厳密に比べる
  const { data, error } = await admin
    .from('videos')
    .select(`id, ${column}`)
    .like(column, `%${path}`)
    .neq('id', excludeVideoId)
    .limit(1000);
  if (error) {
    console.warn('[safeStorage] 参照カウントに失敗:', error.message);
    return null;
  }
  const ids = new Set<number>();
  for (const row of (data || []) as any[]) {
    if (extractStoragePath(row[column], bucket) === path) ids.add(row.id);
  }
  // 動画は file_path にもパスを持っている（URL と食い違っていても共有とみなす）
  if (bucket === 'videos') {
    const { data: byPath, error: pathError } = await admin
      .from('videos')
      .select('id')
      .eq('file_path', path)
      .neq('id', excludeVideoId)
      .limit(1000);
    if (pathError) {
      console.warn('[safeStorage] 参照カウント（file_path）に失敗:', pathError.message);
      return null;
    }
    (byPath || []).forEach((r: any) => ids.add(r.id));
  }
  return ids.size;
}

export interface RemoveAssetResult {
  /** どちらかの保存先で実際に削除したか */
  deleted: boolean;
  /** 共有している他レコード数（-1 は照会失敗で削除を見送り） */
  sharedWith: number;
  path?: string;
  /** Supabase Storage（旧保存先）での結果 */
  supabase?: 'deleted' | 'not_found' | 'error';
  /** R2（動画の配信元）での結果。動画のときだけ */
  r2?: R2DeleteResult;
  error?: string;
}

/**
 * 動画/サムネイルの物理ファイルを「他の videos レコードが同じファイルを参照していない場合のみ」削除する。
 *
 * コース複製では動画ファイルを物理コピーせず同一ファイルを共有するため、
 * 無条件に削除するとコピー元（または他のコピー）の動画がリンク切れになる。
 * これを防ぐための参照カウント付き削除。
 *
 * 動画は Supabase Storage（旧保存先）と Cloudflare R2（配信元）の両方から消す。
 * 呼び出し側は、置き換え・削除の DB 更新が成功した「あと」に呼ぶこと。
 * actor を渡すと、削除の記録を system_logs（video_file_deleted）に残す。
 */
export async function removeVideoAssetIfUnreferenced(
  admin: SupabaseClient,
  params: {
    url: string | null | undefined;
    bucket: 'videos' | 'thumbnails';
    column: 'file_url' | 'thumbnail_url';
    /** 参照カウントから除外する動画 ID（置き換え/削除対象の自分自身）。除外不要なら -1 等 */
    excludeVideoId: number | string;
    /** 誰が・なぜ消したか（記録用） */
    actor?: { userId: string; reason: 'replace' | 'delete' | 'course_delete' };
  }
): Promise<RemoveAssetResult> {
  const { url, bucket, column, excludeVideoId, actor } = params;
  const path = extractStoragePath(url, bucket);
  if (!url || !path) return { deleted: false, sharedWith: 0 };

  const shared = await countOtherReferences(admin, { path, bucket, column, excludeVideoId });
  if (shared === null) {
    // カウントに失敗した場合は安全側に倒して物理削除しない（データ保護優先）
    return { deleted: false, sharedWith: -1, path };
  }
  if (shared > 0) {
    console.log(`[safeStorage] ${bucket} は他 ${shared} 件と共有中のため物理削除をスキップ: ${path}`);
    return { deleted: false, sharedWith: shared, path };
  }

  // Supabase Storage（旧保存先。R2 移行前のファイルやロールバック用のコピーがある）
  const { data: removed, error: removeError } = await admin.storage.from(bucket).remove([path]);
  const supabase: RemoveAssetResult['supabase'] = removeError
    ? 'error'
    : removed && removed.length > 0
    ? 'deleted'
    : 'not_found';
  if (removeError) console.warn(`[safeStorage] ${bucket} の削除に失敗（Supabase）:`, removeError.message);

  // R2（動画の配信元）
  let r2: R2DeleteResult | undefined;
  let r2Error: string | undefined;
  if (bucket === 'videos') {
    const r = await deleteR2Object(path);
    r2 = r.result;
    r2Error = r.error;
    if (r.result === 'error') console.warn('[safeStorage] 動画の削除に失敗（R2）:', path, r.error);
  }

  const result: RemoveAssetResult = {
    deleted: supabase === 'deleted' || r2 === 'deleted',
    sharedWith: 0,
    path,
    supabase,
    r2,
    error: removeError?.message || (r2 === 'error' ? r2Error : undefined),
  };

  if (actor && (result.deleted || result.error)) {
    const { error: logError } = await admin.from('system_logs').insert({
      user_id: actor.userId,
      action: 'video_file_deleted',
      resource_type: bucket === 'videos' ? 'video_file' : 'thumbnail_file',
      resource_id: String(excludeVideoId).slice(0, 50),
      details: { reason: actor.reason, bucket, path, supabase, r2, error: result.error || null },
    });
    if (logError) console.warn('[safeStorage] system_logs への記録に失敗:', logError.message);
  }
  return result;
}
