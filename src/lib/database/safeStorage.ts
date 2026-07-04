import type { SupabaseClient } from '@supabase/supabase-js';

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
 * 動画/サムネイルの物理ファイルを「他の videos レコードが同じ URL を参照していない場合のみ」削除する。
 *
 * コース複製では動画ファイルを物理コピーせず同一ファイルを共有するため、
 * 無条件に削除するとコピー元（または他のコピー）の動画がリンク切れになる。
 * これを防ぐための参照カウント付き削除。
 *
 * @returns deleted: 実際に物理削除したか / sharedWith: 共有している他レコード数
 */
export async function removeVideoAssetIfUnreferenced(
  admin: SupabaseClient,
  params: {
    url: string | null | undefined;
    bucket: 'videos' | 'thumbnails';
    column: 'file_url' | 'thumbnail_url';
    /** 参照カウントから除外する動画 ID（置き換え/削除対象の自分自身）。除外不要なら -1 等 */
    excludeVideoId: number | string;
  }
): Promise<{ deleted: boolean; sharedWith: number }> {
  const { url, bucket, column, excludeVideoId } = params;
  const path = extractStoragePath(url, bucket);
  if (!url || !path) return { deleted: false, sharedWith: 0 };

  const { count, error: countError } = await admin
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .eq(column, url)
    .neq('id', excludeVideoId);

  if (countError) {
    // カウントに失敗した場合は安全側に倒して物理削除しない（データ保護優先）
    console.warn('[safeStorage] 参照カウントに失敗したため物理削除をスキップ:', countError.message);
    return { deleted: false, sharedWith: -1 };
  }

  if (count && count > 0) {
    console.log(`[safeStorage] ${bucket} は他 ${count} 件と共有中のため物理削除をスキップ: ${path}`);
    return { deleted: false, sharedWith: count };
  }

  const { error: removeError } = await admin.storage.from(bucket).remove([path]);
  if (removeError) {
    console.warn(`[safeStorage] ${bucket} 削除失敗:`, removeError.message);
    return { deleted: false, sharedWith: 0 };
  }
  return { deleted: true, sharedWith: 0 };
}
