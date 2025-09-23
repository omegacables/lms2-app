import { supabase } from '@/lib/database/supabase';

// ストレージバケット名の定義
export const STORAGE_BUCKETS = {
  VIDEOS: 'videos',
  THUMBNAILS: 'thumbnails',
  AVATARS: 'avatars',
  CERTIFICATES: 'certificates',
  ATTACHMENTS: 'attachments'
} as const;

// バケットの初期化（存在しない場合は作成）
export async function initializeStorageBuckets() {
  const bucketsToCreate = [
    { name: STORAGE_BUCKETS.VIDEOS, public: false, fileSizeLimit: 3221225472 }, // 3GB
    { name: STORAGE_BUCKETS.THUMBNAILS, public: true, fileSizeLimit: 10485760 }, // 10MB
    { name: STORAGE_BUCKETS.AVATARS, public: true, fileSizeLimit: 5242880 }, // 5MB
    { name: STORAGE_BUCKETS.CERTIFICATES, public: false, fileSizeLimit: 52428800 }, // 50MB
    { name: STORAGE_BUCKETS.ATTACHMENTS, public: false, fileSizeLimit: 104857600 } // 100MB
  ];

  for (const bucket of bucketsToCreate) {
    try {
      // バケットの存在確認
      const { data: existingBucket } = await supabase.storage.getBucket(bucket.name);
      
      if (!existingBucket) {
        // バケットが存在しない場合は作成
        const { error } = await supabase.storage.createBucket(bucket.name, {
          public: bucket.public,
          fileSizeLimit: bucket.fileSizeLimit
        });
        
        if (error && !error.message.includes('already exists')) {
          console.error(`Failed to create bucket ${bucket.name}:`, error);
        } else {
          console.log(`Bucket ${bucket.name} created successfully`);
        }
      }
    } catch (error) {
      console.error(`Error checking/creating bucket ${bucket.name}:`, error);
    }
  }
}

// 動画ファイルのアップロード
export async function uploadVideo(
  file: File,
  courseId: string | number,
  onProgress?: (progress: number) => void
): Promise<{ url: string; path: string; publicUrl: string }> {
  try {
    // ファイル名の生成
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const fileName = `course-${courseId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    
    // タイムアウトを設定してアップロード（5分）
    const uploadPromise = supabase.storage
      .from(STORAGE_BUCKETS.VIDEOS)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Supabaseへの接続がタイムアウトしました。ネットワーク接続を確認してください。')), 300000); // 5分
    });

    // プログレストラッキング付きアップロード
    const { data, error } = await Promise.race([uploadPromise, timeoutPromise]) as any;

    if (error) {
      console.error('Upload error details:', error);
      // エラーメッセージを詳細にする
      if (error.message?.includes('Bucket not found')) {
        throw new Error('ストレージバケットが見つかりません。管理者に連絡してください。');
      } else if (error.message?.includes('Payload too large')) {
        throw new Error('ファイルサイズが大きすぎます。3GB以下のファイルを選択してください。');
      } else if (error.message?.includes('Invalid file type')) {
        throw new Error('サポートされていないファイル形式です。');
      }
      throw error;
    }

    // 署名付きURLの生成（1週間有効）
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from(STORAGE_BUCKETS.VIDEOS)
      .createSignedUrl(fileName, 604800); // 7 days

    if (urlError) {
      throw urlError;
    }

    // パブリックURLの生成（参照用）
    const { data: { publicUrl } } = supabase.storage
      .from(STORAGE_BUCKETS.VIDEOS)
      .getPublicUrl(fileName);

    return {
      url: signedUrlData.signedUrl,
      path: fileName,
      publicUrl
    };
  } catch (error) {
    console.error('Video upload error:', error);
    throw new Error(`動画のアップロードに失敗しました: ${(error as Error).message}`);
  }
}

// 動画ファイルの置き換え
export async function replaceVideo(
  file: File,
  existingPath: string,
  courseId: string | number
): Promise<{ url: string; path: string; publicUrl: string }> {
  try {
    // 既存ファイルの削除
    await deleteVideo(existingPath);
    
    // 新しいファイルのアップロード
    return await uploadVideo(file, courseId);
  } catch (error) {
    console.error('Video replace error:', error);
    throw new Error(`動画の置き換えに失敗しました: ${(error as Error).message}`);
  }
}

// 動画ファイルの削除
export async function deleteVideo(path: string): Promise<void> {
  try {
    const { error } = await supabase.storage
      .from(STORAGE_BUCKETS.VIDEOS)
      .remove([path]);

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Video delete error:', error);
    throw new Error(`動画の削除に失敗しました: ${(error as Error).message}`);
  }
}

// サムネイルのアップロード
export async function uploadThumbnail(
  file: File,
  courseId: string | number
): Promise<{ url: string; path: string }> {
  try {
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const fileName = `course-${courseId}/${Date.now()}-thumbnail.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.THUMBNAILS)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true // サムネイルは上書き可能
      });

    if (error) {
      throw error;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(STORAGE_BUCKETS.THUMBNAILS)
      .getPublicUrl(fileName);

    return {
      url: publicUrl,
      path: fileName
    };
  } catch (error) {
    console.error('Thumbnail upload error:', error);
    throw new Error(`サムネイルのアップロードに失敗しました: ${(error as Error).message}`);
  }
}

// 署名付きURLの生成
export async function getSignedUrl(
  bucket: keyof typeof STORAGE_BUCKETS,
  path: string,
  expiresIn: number = 3600
): Promise<string> {
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS[bucket])
      .createSignedUrl(path, expiresIn);

    if (error) {
      throw error;
    }

    return data.signedUrl;
  } catch (error) {
    console.error('Get signed URL error:', error);
    throw new Error(`署名付きURLの生成に失敗しました: ${(error as Error).message}`);
  }
}

// ファイルサイズのフォーマット
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ファイルタイプの検証
export function validateVideoFile(file: File): { valid: boolean; error?: string } {
  const validTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo'];
  const maxSize = 3 * 1024 * 1024 * 1024; // 3GB

  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'サポートされていないファイル形式です。MP4、WebM、OGG、MOV、AVIファイルを使用してください。'
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `ファイルサイズが大きすぎます。最大3GBまでアップロード可能です。現在のファイルサイズ: ${formatFileSize(file.size)}`
    };
  }

  return { valid: true };
}

// サムネイルファイルの検証
export function validateThumbnailFile(file: File): { valid: boolean; error?: string } {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'サポートされていないファイル形式です。JPEG、PNG、WebPファイルを使用してください。'
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `ファイルサイズが大きすぎます。最大10MBまでアップロード可能です。現在のファイルサイズ: ${formatFileSize(file.size)}`
    };
  }

  return { valid: true };
}