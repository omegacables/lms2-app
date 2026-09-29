import * as tus from 'tus-js-client';
import { supabase } from '@/lib/database/supabase';

// 動画ファイルのアップロード（ブラウザ専用）。
// NEXT_PUBLIC_USE_R2_UPLOAD=true なら Cloudflare R2 へ presigned PUT で直接アップロードし、
// 未設定なら従来どおり Supabase Storage（TUS）へアップロードする。
// file_url はどちらも「Supabase 公開URL形式」で返す（再生時に buildMediaUrl が R2 の同じパスへマップする）。
// ※ R2 配信のサイトで Supabase にアップロードすると再生できない動画になるため、
//   動画のアップロードは必ずこの関数（または同じ切替をしている VideoUploader / BulkVideoUploader）を通す。

export interface UploadedVideo {
  /** videos.file_url に保存する URL */
  fileUrl: string;
  /** ストレージ上のパス（videos.file_path） */
  filePath: string;
  storage: 'r2' | 'supabase';
}

export const isR2UploadEnabled = (): boolean => process.env.NEXT_PUBLIC_USE_R2_UPLOAD === 'true';

export async function uploadVideoFile(params: {
  file: File;
  courseId: number | string;
  accessToken: string;
  /** 0〜1 の進捗 */
  onProgress?: (fraction: number) => void;
}): Promise<UploadedVideo> {
  const { file, courseId, accessToken, onProgress } = params;
  const contentType = file.type || 'video/mp4';

  if (isR2UploadEnabled()) {
    const res = await fetch('/api/videos/get-r2-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ fileName: file.name, contentType, courseId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'アップロードURLの取得に失敗しました');

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', json.uploadUrl);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(e.loaded / e.total);
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`アップロード失敗 (HTTP ${xhr.status})`));
      xhr.onerror = () => reject(new Error('アップロード中にネットワークエラーが発生しました'));
      xhr.send(file);
    });
    return { fileUrl: json.fileUrl, filePath: json.path, storage: 'r2' };
  }

  const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = `course_${courseId}/${Date.now()}_${safeFileName}`;
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${projectUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: 'videos',
        objectName: filePath,
        contentType,
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024, // 6MB chunks (Supabase 推奨)
      onError: (err) => reject(err),
      onProgress: (bytesUploaded, bytesTotal) => onProgress?.(bytesUploaded / bytesTotal),
      onSuccess: () => resolve(),
    });
    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length) upload.resumeFromPreviousUpload(previousUploads[0]);
      upload.start();
    });
  });

  const { data: { publicUrl } } = supabase.storage.from('videos').getPublicUrl(filePath);
  return { fileUrl: publicUrl, filePath, storage: 'supabase' };
}

/** DB 保存に失敗したときの後始末（R2 はブラウザから削除できないので Supabase のときだけ） */
export async function removeUploadedVideo(uploaded: UploadedVideo): Promise<void> {
  if (uploaded.storage === 'supabase') {
    await supabase.storage.from('videos').remove([uploaded.filePath]);
  }
}
