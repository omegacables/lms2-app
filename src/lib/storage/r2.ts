import { S3Client, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

// Cloudflare R2（S3互換。動画の配信元）。サーバー専用。
// 必要な環境変数: R2_ACCOUNT_ID / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
// バケットはサイトごとに別（stus-lms = lms-videos、axialms = axialms-videos）。

let cachedClient: S3Client | null = null;

export function r2Client(): S3Client | null {
  if (cachedClient) return cachedClient;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

export function r2Bucket(): string | null {
  return process.env.R2_BUCKET || null;
}

/**
 * R2 のファイルを消してよい環境か。本番（Vercel の production）だけで消す。
 * ローカルの .env.local は「DB は axialms、R2 は stus-lms のバケット」のように別サイトの組み合わせに
 * なっていることがあり、その状態で消すと他サイトの動画を消してしまうため。
 * どうしても本番以外で消すときは R2_DELETE_ENABLED=true を付ける。
 */
export function canDeleteFromR2(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.R2_DELETE_ENABLED === 'true';
}

export type R2DeleteResult = 'deleted' | 'not_found' | 'skipped' | 'error';

/** R2 のファイルを1つ消す（無ければ not_found、R2 未設定・本番以外なら skipped） */
export async function deleteR2Object(key: string): Promise<{ result: R2DeleteResult; error?: string }> {
  const client = r2Client();
  const bucket = r2Bucket();
  if (!client || !bucket) return { result: 'skipped', error: 'R2 が未設定' };
  if (!canDeleteFromR2()) return { result: 'skipped', error: '本番以外の環境では R2 のファイルを削除しない' };

  try {
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } catch (e: any) {
      const status = e?.$metadata?.httpStatusCode;
      if (status === 404 || e?.name === 'NotFound' || e?.name === 'NoSuchKey') return { result: 'not_found' };
      throw e;
    }
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return { result: 'deleted' };
  } catch (e) {
    return { result: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}
