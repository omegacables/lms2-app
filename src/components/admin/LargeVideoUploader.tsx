'use client';

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/database/supabase';
import { Button } from '@/components/ui/Button';
import {
  CloudArrowUpIcon,
  PauseIcon,
  PlayIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface UploadChunk {
  index: number;
  start: number;
  end: number;
  blob: Blob;
  uploaded: boolean;
  retries: number;
}

interface LargeVideoUploaderProps {
  courseId: number;
  onSuccess?: (videoId: number) => void;
  onError?: (error: Error) => void;
}

// チャンクサイズ: 10MB（調整可能）
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_CONCURRENT_UPLOADS = 3; // 同時アップロード数
const MAX_RETRIES = 3; // 最大リトライ回数

export function LargeVideoUploader({
  courseId,
  onSuccess,
  onError
}: LargeVideoUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedSize, setUploadedSize] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<UploadChunk[]>([]);

  const uploadStartTime = useRef<number>(0);
  const lastUploadedSize = useRef<number>(0);
  const speedInterval = useRef<NodeJS.Timeout | null>(null);
  const abortController = useRef<AbortController | null>(null);

  // ファイルサイズをフォーマット
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // 残り時間をフォーマット
  const formatTime = (seconds: number): string => {
    if (!seconds || seconds === Infinity) return '計算中...';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}時間${minutes}分`;
    } else if (minutes > 0) {
      return `${minutes}分${secs}秒`;
    }
    return `${secs}秒`;
  };

  // ファイルをチャンクに分割
  const createChunks = (file: File): UploadChunk[] => {
    const chunks: UploadChunk[] = [];
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      chunks.push({
        index: i,
        start,
        end,
        blob: file.slice(start, end),
        uploaded: false,
        retries: 0
      });
    }

    return chunks;
  };

  // アップロード速度を計算
  const calculateSpeed = () => {
    const now = Date.now();
    const elapsed = (now - uploadStartTime.current) / 1000; // 秒
    const currentUploaded = uploadedSize;
    const bytesPerSecond = (currentUploaded - lastUploadedSize.current) / elapsed;

    setUploadSpeed(bytesPerSecond);

    // 残り時間を計算
    const remainingBytes = totalSize - currentUploaded;
    const estimatedSeconds = remainingBytes / bytesPerSecond;
    setTimeRemaining(estimatedSeconds);

    lastUploadedSize.current = currentUploaded;
    uploadStartTime.current = now;
  };

  // チャンクをアップロード
  const uploadChunk = async (chunk: UploadChunk, sessionId: string): Promise<boolean> => {
    if (paused || !abortController.current) return false;

    try {
      const fileName = `chunks/${sessionId}/chunk_${chunk.index.toString().padStart(6, '0')}`;

      const { error } = await supabase.storage
        .from('videos')
        .upload(fileName, chunk.blob, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      console.error(`Chunk ${chunk.index} upload failed:`, error);

      if (chunk.retries < MAX_RETRIES) {
        chunk.retries++;
        console.log(`Retrying chunk ${chunk.index} (attempt ${chunk.retries})`);
        return await uploadChunk(chunk, sessionId);
      }

      return false;
    }
  };

  // 並列アップロード管理
  const uploadChunksParallel = async (chunks: UploadChunk[], sessionId: string) => {
    let currentIndex = 0;
    const activeUploads: Promise<void>[] = [];

    const uploadNext = async (): Promise<void> => {
      if (currentIndex >= chunks.length || paused) return;

      const chunk = chunks[currentIndex];
      currentIndex++;

      const success = await uploadChunk(chunk, sessionId);

      if (success) {
        chunk.uploaded = true;
        const uploaded = chunk.end - chunk.start;
        setUploadedSize(prev => prev + uploaded);

        // プログレス更新
        const completedChunks = chunks.filter(c => c.uploaded).length;
        setProgress((completedChunks / chunks.length) * 100);
      } else {
        throw new Error(`Failed to upload chunk ${chunk.index} after ${MAX_RETRIES} retries`);
      }

      // 次のチャンクをアップロード
      await uploadNext();
    };

    // 同時実行数まで並列でアップロード開始
    for (let i = 0; i < Math.min(MAX_CONCURRENT_UPLOADS, chunks.length); i++) {
      activeUploads.push(uploadNext());
    }

    // すべてのアップロードが完了するまで待つ
    await Promise.all(activeUploads);
  };

  // チャンクを結合
  const mergeChunks = async (sessionId: string, fileName: string, totalChunks: number) => {
    try {
      // Supabase Storageでは直接結合はできないため、
      // サーバーサイドで処理するか、クライアントで再結合する必要があります
      // ここでは、メタデータをデータベースに保存します

      const { data, error } = await supabase
        .from('videos')
        .insert({
          course_id: courseId,
          title: fileName,
          description: `Large file upload (${formatFileSize(totalSize)})`,
          url: `chunks/${sessionId}`, // チャンクの場所を保存
          duration: 0,
          order_index: 999,
          status: 'processing', // 処理中ステータス
          metadata: {
            type: 'chunked',
            sessionId,
            totalChunks,
            totalSize,
            chunkSize: CHUNK_SIZE,
            uploadedAt: new Date().toISOString()
          }
        })
        .select()
        .single();

      if (error) throw error;

      return data.id;
    } catch (error) {
      console.error('Failed to save video metadata:', error);
      throw error;
    }
  };

  // メインアップロード処理
  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgress(0);
    setUploadedSize(0);
    setTotalSize(file.size);

    // セッションIDを生成
    const sessionId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    setUploadId(sessionId);

    // チャンクを作成
    const fileChunks = createChunks(file);
    setChunks(fileChunks);

    // アップロード開始時間を記録
    uploadStartTime.current = Date.now();
    lastUploadedSize.current = 0;

    // 速度計算インターバルを開始
    speedInterval.current = setInterval(calculateSpeed, 1000);

    // AbortControllerを作成
    abortController.current = new AbortController();

    try {
      // チャンクを並列アップロード
      await uploadChunksParallel(fileChunks, sessionId);

      // チャンクを結合（メタデータを保存）
      const videoId = await mergeChunks(sessionId, file.name, fileChunks.length);

      setProgress(100);
      onSuccess?.(videoId);

      // リセット
      setTimeout(() => {
        setFile(null);
        setProgress(0);
        setUploadedSize(0);
        setTotalSize(0);
        setChunks([]);
      }, 2000);

    } catch (err) {
      console.error('Upload failed:', err);
      setError(err instanceof Error ? err.message : 'アップロードに失敗しました');
      onError?.(err instanceof Error ? err : new Error('Upload failed'));
    } finally {
      setUploading(false);
      setPaused(false);

      if (speedInterval.current) {
        clearInterval(speedInterval.current);
        speedInterval.current = null;
      }
    }
  };

  // アップロードを一時停止
  const handlePause = () => {
    setPaused(!paused);
    if (abortController.current && !paused) {
      abortController.current.abort();
    }
  };

  // アップロードをキャンセル
  const handleCancel = async () => {
    if (abortController.current) {
      abortController.current.abort();
    }

    setUploading(false);
    setPaused(false);
    setProgress(0);
    setUploadedSize(0);
    setError('アップロードがキャンセルされました');

    // アップロード済みのチャンクを削除
    if (uploadId) {
      try {
        const { error } = await supabase.storage
          .from('videos')
          .remove([`chunks/${uploadId}`]);

        if (error) {
          console.error('Failed to clean up chunks:', error);
        }
      } catch (err) {
        console.error('Cleanup error:', err);
      }
    }

    if (speedInterval.current) {
      clearInterval(speedInterval.current);
      speedInterval.current = null;
    }
  };

  // ファイル選択処理
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    // ファイルサイズチェック（3TB = 3,298,534,883,328 bytes）
    const maxSize = 3 * 1024 * 1024 * 1024 * 1024; // 3TB
    if (selectedFile.size > maxSize) {
      setError('ファイルサイズは3TB以下にしてください');
      return;
    }

    // ファイル形式チェック
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
    if (!allowedTypes.includes(selectedFile.type)) {
      setError('対応していないファイル形式です（MP4, WebM, MOV, AVI, MKVのみ）');
      return;
    }

    setFile(selectedFile);
    setError(null);
  };

  return (
    <div className="space-y-6 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          大容量動画アップロード（最大3TB）
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          マルチパート・チャンクアップロードで大容量ファイルを安定して転送
        </p>
      </div>

      {/* ファイル選択 */}
      {!file && !uploading && (
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
          <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
          <div className="mt-4">
            <label htmlFor="large-file-upload" className="cursor-pointer">
              <span className="mt-2 block text-sm font-medium text-gray-900 dark:text-white">
                クリックして動画を選択、またはドラッグ&ドロップ
              </span>
              <input
                id="large-file-upload"
                name="large-file-upload"
                type="file"
                className="sr-only"
                accept="video/*"
                onChange={handleFileSelect}
              />
            </label>
            <p className="mt-1 text-xs text-gray-500">
              MP4, WebM, MOV, AVI, MKV（最大3TB）
            </p>
          </div>
        </div>
      )}

      {/* 選択されたファイル情報 */}
      {file && !uploading && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {file.name}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {formatFileSize(file.size)}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {Math.ceil(file.size / CHUNK_SIZE)}個のチャンクに分割
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleUpload} variant="primary">
                <CloudArrowUpIcon className="w-5 h-5 mr-2" />
                アップロード開始
              </Button>
              <Button
                onClick={() => setFile(null)}
                variant="outline"
              >
                キャンセル
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* アップロード進捗 */}
      {uploading && (
        <div className="space-y-4">
          {/* プログレスバー */}
          <div>
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
              <span>アップロード進捗</span>
              <span>{progress.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* 詳細情報 */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">転送済み</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {formatFileSize(uploadedSize)} / {formatFileSize(totalSize)}
              </p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">アップロード速度</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {formatFileSize(uploadSpeed)}/秒
              </p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">残り時間</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {timeRemaining ? formatTime(timeRemaining) : '計算中...'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">チャンク進捗</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {chunks.filter(c => c.uploaded).length} / {chunks.length}
              </p>
            </div>
          </div>

          {/* コントロールボタン */}
          <div className="flex gap-2">
            <Button
              onClick={handlePause}
              variant="outline"
              className="flex-1"
            >
              {paused ? (
                <>
                  <PlayIcon className="w-5 h-5 mr-2" />
                  再開
                </>
              ) : (
                <>
                  <PauseIcon className="w-5 h-5 mr-2" />
                  一時停止
                </>
              )}
            </Button>
            <Button
              onClick={handleCancel}
              variant="outline"
              className="flex-1 text-red-600 hover:text-red-700"
            >
              <XMarkIcon className="w-5 h-5 mr-2" />
              キャンセル
            </Button>
          </div>

          {/* チャンク状態表示（デバッグ用、必要に応じて非表示） */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-900 rounded text-xs">
              <p className="font-mono text-gray-600 dark:text-gray-400">
                Session ID: {uploadId}
              </p>
              <div className="mt-2 grid grid-cols-10 gap-1">
                {chunks.map((chunk, index) => (
                  <div
                    key={index}
                    className={`h-2 rounded ${
                      chunk.uploaded
                        ? 'bg-green-500'
                        : chunk.retries > 0
                        ? 'bg-yellow-500'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                    title={`Chunk ${index}: ${
                      chunk.uploaded ? 'Uploaded' : `Retries: ${chunk.retries}`
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-start">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="ml-3">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* 成功メッセージ */}
      {progress === 100 && !error && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-center">
            <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
            <p className="ml-3 text-sm text-green-700 dark:text-green-400">
              アップロードが完了しました！
            </p>
          </div>
        </div>
      )}
    </div>
  );
}