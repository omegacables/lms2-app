// チャンクアップロードユーティリティ
import { supabase } from '@/lib/database/supabase';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

// ファイルを直接Supabase Storageにアップロード（小さいファイル用）
export async function uploadSmallFile(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void
) {
  try {
    // 50MB以下のファイルは直接アップロード
    if (file.size <= 50 * 1024 * 1024) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;
      
      if (onProgress) {
        onProgress({
          loaded: file.size,
          total: file.size,
          percentage: 100
        });
      }

      return data;
    }

    // 大きいファイルは複数パートでアップロード
    return await uploadLargeFile(bucket, path, file, onProgress);
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
}

// 大きなファイルをマルチパートアップロード
async function uploadLargeFile(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void
) {
  const chunks = Math.ceil(file.size / CHUNK_SIZE);
  let uploadedBytes = 0;

  // Create multipart upload session
  const sessionId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const tempPaths: string[] = [];

  try {
    // Upload chunks
    for (let i = 0; i < chunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const chunkPath = `${path}.part${i}`;

      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(chunkPath, chunk, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) throw error;
      
      tempPaths.push(chunkPath);
      uploadedBytes += chunk.size;

      if (onProgress) {
        onProgress({
          loaded: uploadedBytes,
          total: file.size,
          percentage: Math.round((uploadedBytes / file.size) * 100)
        });
      }
    }

    // TODO: サーバーサイドでチャンクを結合する処理が必要
    // 現在は最初のチャンクのパスを返す（暫定処理）
    return { path: tempPaths[0] };

  } catch (error) {
    // Clean up partial uploads on error
    for (const tempPath of tempPaths) {
      try {
        await supabase.storage.from(bucket).remove([tempPath]);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }
    throw error;
  }
}

// ファイルサイズに基づいてアップロード方法を選択
export async function smartUpload(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void
) {
  // 50MB以下は直接アップロード
  if (file.size <= 50 * 1024 * 1024) {
    return uploadSmallFile(bucket, path, file, onProgress);
  }

  // 50MB以上はAPIエンドポイント経由でアップロード
  // （サーバーサイドでService Role Keyを使用）
  throw new Error('大きなファイル（50MB以上）はAPIエンドポイント経由でアップロードしてください');
}