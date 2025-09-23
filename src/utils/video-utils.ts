/**
 * 動画ファイルから実際の長さ（duration）を取得
 */
export async function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      const duration = Math.floor(video.duration);
      resolve(duration);
    };

    video.onerror = () => {
      reject(new Error('動画ファイルの読み込みに失敗しました'));
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * 秒数を時:分:秒形式に変換
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * 動画ファイルのバリデーション
 */
export function validateVideoFile(file: File) {
  const validTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
  const maxSize = 3 * 1024 * 1024 * 1024; // 3GB

  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'サポートされていない動画形式です。MP4、WebM、OGG形式をご利用ください。'
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'ファイルサイズが大きすぎます。3GB以下のファイルを選択してください。'
    };
  }

  return { valid: true };
}