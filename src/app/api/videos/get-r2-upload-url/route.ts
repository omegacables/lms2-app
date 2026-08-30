import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Cloudflare R2（S3互換）への presigned PUT URL を発行する。
// 必要な環境変数: R2_ACCOUNT_ID / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
function r2Client(): S3Client | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const client = r2Client();
  const bucket = process.env.R2_BUCKET;
  if (!client || !bucket) {
    return NextResponse.json(
      { error: 'R2アップロードが未設定です（R2_ACCOUNT_ID / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY を設定してください）' },
      { status: 400 }
    );
  }

  const { fileName, contentType, courseId } = await request.json();
  if (!fileName || !courseId) {
    return NextResponse.json({ error: 'fileName と courseId は必須です' }, { status: 400 });
  }

  const safeName = String(fileName).replace(/[^a-zA-Z0-9.-]/g, '_');
  const timestamp = Date.now();
  // 既存(Supabase)と同じ命名規則。配信は buildMediaUrl が R2 の同一パスへマップする。
  const path = `course_${courseId}/${timestamp}_${safeName}`;
  const type = contentType || 'video/mp4';

  try {
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket, Key: path, ContentType: type }),
      { expiresIn: 60 * 60 } // 1時間
    );

    // file_url は既存レコードと同じ「Supabase public URL 形式」で保存する。
    // 再生時 extractStoragePath でパスに戻し、buildMediaUrl が R2 へマップするため、
    // 実体が R2 にあっても既存コードと整合する。
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const fileUrl = `${supabaseUrl}/storage/v1/object/public/videos/${path}`;

    return NextResponse.json({ uploadUrl, path, fileUrl, contentType: type });
  } catch (e) {
    console.error('[get-r2-upload-url] presign error:', e);
    return NextResponse.json({ error: 'アップロードURLの発行に失敗しました', details: String(e) }, { status: 500 });
  }
}
