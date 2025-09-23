import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface UploadOptions {
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
  maxRetries?: number;
}

export class VideoUploader {
  private supabase = createClientComponentClient();
  private maxRetries = 3;
  private retryDelay = 1000; // 1 second

  async uploadWithRetry(
    bucket: string,
    path: string,
    file: File,
    options: UploadOptions = {}
  ): Promise<{ data: any; error: any }> {
    const { onProgress, onError, maxRetries = this.maxRetries } = options;
    
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Convert file to ArrayBuffer for more reliable upload
        const arrayBuffer = await file.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);
        
        // Attempt upload
        const { data, error } = await this.supabase.storage
          .from(bucket)
          .upload(path, buffer, {
            contentType: file.type,
            cacheControl: '3600',
            upsert: false,
            duplex: 'half'
          });

        if (error) {
          lastError = error;
          
          // Check if error is retryable
          if (this.isRetryableError(error) && attempt < maxRetries) {
            console.log(`Upload attempt ${attempt} failed, retrying in ${this.retryDelay}ms...`);
            await this.delay(this.retryDelay * attempt); // Exponential backoff
            continue;
          }
          
          throw error;
        }

        // Success
        if (onProgress) {
          onProgress(100);
        }
        
        return { data, error: null };
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          if (onError) {
            onError(error as Error);
          }
          return { data: null, error: lastError };
        }
        
        console.warn(`Upload attempt ${attempt} failed:`, error);
        await this.delay(this.retryDelay * attempt);
      }
    }
    
    return { data: null, error: lastError };
  }

  private isRetryableError(error: any): boolean {
    // Retry on timeout, network errors, and specific status codes
    const retryableMessages = [
      'timeout',
      'network',
      'fetch',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND'
    ];
    
    const errorMessage = error.message?.toLowerCase() || '';
    return retryableMessages.some(msg => errorMessage.includes(msg));
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // チャンク分割アップロード（将来的な実装用）
  async uploadLargeFile(
    bucket: string,
    path: string,
    file: File,
    options: UploadOptions = {}
  ): Promise<{ data: any; error: any }> {
    const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunks
    const { onProgress } = options;
    
    // For now, if file is larger than 3GB, return error
    if (file.size > 3 * 1024 * 1024 * 1024) {
      return {
        data: null,
        error: new Error('ファイルサイズが3GBを超えています。動画を圧縮してから再度お試しください。')
      };
    }
    
    // Use regular upload with retry for files under 3GB
    return this.uploadWithRetry(bucket, path, file, options);
  }
}

// Export helper functions
export async function uploadVideoWithRetry(
  courseId: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ url: string; path: string } | null> {
  const uploader = new VideoUploader();
  const fileName = `course-${courseId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  
  const { data, error } = await uploader.uploadWithRetry(
    'videos',
    fileName,
    file,
    { onProgress }
  );
  
  if (error) {
    console.error('Video upload failed:', error);
    throw new Error(getErrorMessage(error));
  }
  
  // Get public URL
  const supabase = createClientComponentClient();
  const { data: { publicUrl } } = supabase.storage
    .from('videos')
    .getPublicUrl(fileName);
  
  return {
    url: publicUrl,
    path: fileName
  };
}

function getErrorMessage(error: any): string {
  if (error.message?.includes('exceeded the maximum allowed size')) {
    return 'ファイルサイズが大きすぎます。3GB以下のファイルを選択してください。Supabaseダッシュボードでグローバル設定も確認してください。';
  }
  if (error.message?.includes('timeout')) {
    return 'アップロードがタイムアウトしました。ネットワーク接続を確認して再度お試しください。';
  }
  if (error.message?.includes('Bucket not found')) {
    return 'ストレージの設定に問題があります。管理者に連絡してください。';
  }
  if (error.statusCode === 413) {
    return 'ファイルサイズが大きすぎます。3GB以下に圧縮してから再度お試しください。';
  }
  
  return error.message || 'アップロードに失敗しました。再度お試しください。';
}