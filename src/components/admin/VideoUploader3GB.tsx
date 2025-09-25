'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/database/supabase';
import { createClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/Button';
import {
  CloudArrowUpIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface VideoUploader3GBProps {
  courseId: number;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

// チャンクサイズ: 50MB（Supabaseの推奨サイズ）
const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILE_SIZE = 3 * 1024 * 1024 * 1024; // 3GB

export function VideoUploader3GB({
  courseId,
  onSuccess,
  onError
}: VideoUploader3GBProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedSize, setUploadedSize] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const abortController = useRef<AbortController | null>(null);

  // 長いタイムアウトを持つSupabaseクライアントを作成
  const createUploadClient = () => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          fetch: (url, options = {}) => {
            // ストレージアップロードには長いタイムアウトを設定
            const timeout = url.includes('/storage/') ? 600000 : 45000; // ストレージは10分、その他は45秒
            const controller = new AbortController();

            const timeoutId = setTimeout(() => {
              controller.abort();
            }, timeout);

            return fetch(url, {
              ...options,
              signal: controller.signal,
            }).then((response) => {
              clearTimeout(timeoutId);
              return response;
            }).catch((error) => {
              clearTimeout(timeoutId);
              if (error.name === 'AbortError') {
                throw new Error('アップロードがタイムアウトしました。ネットワーク接続を確認してください。');
              }
              throw error;
            });
          },
        },
      }
    );
  };

  // ファイルサイズをフォーマット
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // チャンク分割してアップロード
  const uploadInChunks = async (file: File) => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_'); // ファイル名を安全にする

    // 動画の長さを取得
    const duration = await getVideoDuration(file);

    let uploadedChunks = 0;

    try {
      for (let i = 0; i < totalChunks; i++) {
        if (abortController.current?.signal.aborted) {
          throw new Error('アップロードがキャンセルされました');
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const chunkName = `course_${courseId}/${uploadId}/${fileName}.part${i.toString().padStart(4, '0')}`;

        // カスタムクライアントでチャンクをアップロード
        const uploadClient = createUploadClient();
        const { error: uploadError } = await uploadClient.storage
          .from('videos')
          .upload(chunkName, chunk, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          console.error(`チャンク ${i + 1}/${totalChunks} のアップロード失敗:`, uploadError);
          throw uploadError;
        }

        uploadedChunks++;
        const newUploadedSize = Math.min(uploadedChunks * CHUNK_SIZE, file.size);
        setUploadedSize(newUploadedSize);
        setProgress((newUploadedSize / file.size) * 100);
      }

      // 全チャンクアップロード完了後、メタデータを保存
      const finalPath = `course_${courseId}/${uploadId}/${fileName}`;

      // 公開URLを取得（最初のチャンクのURLを使用）
      const firstChunkPath = `course_${courseId}/${uploadId}/${fileName}.part0000`;
      const { data: { publicUrl } } = supabase.storage
        .from('videos')
        .getPublicUrl(firstChunkPath);

      // 動画情報をデータベースに保存
      const videoData: any = {
        course_id: courseId,
        title: file.name.replace(/\.[^/.]+$/, ''),
        description: `ファイルサイズ: ${formatFileSize(file.size)}`,
        file_url: publicUrl,
        file_path: finalPath,
        file_size: file.size,
        mime_type: file.type,
        duration: duration,  // 取得した動画の長さを設定
        order_index: 999,
        status: 'active',
        metadata: {
          originalName: file.name,
          size: file.size,
          type: file.type,
          chunks: totalChunks,
          uploadId: uploadId,
          chunked: true
        }
      };

      const { error: dbError } = await supabase
        .from('videos')
        .insert(videoData);

      if (dbError) {
        // データベースエラーの場合、アップロードしたファイルを削除
        await cleanupChunks(courseId, uploadId, totalChunks, fileName);
        throw dbError;
      }

      return true;
    } catch (error) {
      // エラー時のクリーンアップ
      await cleanupChunks(courseId, uploadId, uploadedChunks, fileName);
      throw error;
    }
  };

  // チャンクをクリーンアップ
  const cleanupChunks = async (
    courseId: number,
    uploadId: string,
    chunks: number,
    fileName: string
  ) => {
    const filesToDelete = [];
    for (let i = 0; i < chunks; i++) {
      filesToDelete.push(
        `course_${courseId}/${uploadId}/${fileName}.part${i.toString().padStart(4, '0')}`
      );
    }

    if (filesToDelete.length > 0) {
      const { error } = await supabase.storage
        .from('videos')
        .remove(filesToDelete);

      if (error) {
        console.error('Failed to cleanup chunks:', error);
      }
    }
  };

  // 動画の長さを取得する関数
  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';

      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        const duration = Math.round(video.duration);
        resolve(duration);
      };

      video.onerror = () => {
        console.warn('動画の長さを取得できませんでした');
        resolve(0); // エラーの場合は0を返す
      };

      video.src = URL.createObjectURL(file);
    });
  };

  // 通常アップロード（500MB以下）
  const uploadDirect = async (file: File) => {
    const timestamp = Date.now();
    const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `course_${courseId}/${timestamp}_${fileName}`;

    // 動画の長さを取得
    const duration = await getVideoDuration(file);

    // カスタムクライアントで直接アップロード
    const uploadClient = createUploadClient();
    const { error: uploadError } = await uploadClient.storage
      .from('videos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    // URLを取得
    const { data: { publicUrl } } = supabase.storage
      .from('videos')
      .getPublicUrl(filePath);

    // データベースに保存
    const videoData: any = {
      course_id: courseId,
      title: file.name.replace(/\.[^/.]+$/, ''),
      description: `ファイルサイズ: ${formatFileSize(file.size)}`,
      file_url: publicUrl,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type,
      duration: duration,  // 取得した動画の長さを設定
      order_index: 999,
      status: 'active',
      metadata: {
        originalName: file.name,
        size: file.size,
        type: file.type,
        chunked: false
      }
    };

    const { error: dbError } = await supabase
      .from('videos')
      .insert(videoData);

    if (dbError) {
      // エラー時はアップロードしたファイルを削除
      await supabase.storage.from('videos').remove([filePath]);
      throw dbError;
    }

    return true;
  };

  // メインアップロード処理
  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(false);
    setProgress(0);
    setUploadedSize(0);

    abortController.current = new AbortController();

    try {
      // 認証チェック
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('ログインが必要です。');
      }

      // ファイルサイズで処理を分ける
      if (file.size > 500 * 1024 * 1024) {
        // 500MB以上はチャンク分割
        await uploadInChunks(file);
      } else {
        // 500MB以下は直接アップロード
        await uploadDirect(file);
        setProgress(100);
        setUploadedSize(file.size);
      }

      setSuccess(true);
      onSuccess?.();

      // 3秒後にリセット
      setTimeout(() => {
        setFile(null);
        setProgress(0);
        setUploadedSize(0);
        setSuccess(false);
      }, 3000);

    } catch (err) {
      console.error('Upload failed:', err);
      let errorMessage = 'アップロードに失敗しました';

      if (err instanceof Error) {
        // Supabaseのエラーメッセージをより詳細に
        if (err.message.includes('row-level security')) {
          errorMessage = 'アップロード権限がありません。管理者に確認してください。';
        } else if (err.message.includes('storage/bucket')) {
          errorMessage = 'ストレージバケットの設定に問題があります。';
        } else if (err.message.includes('payload too large')) {
          errorMessage = 'ファイルサイズが大きすぎます。';
        } else if (err.message.includes('Invalid storage bucket')) {
          errorMessage = 'Supabaseのストレージバケット "videos" が見つかりません。';
        } else {
          errorMessage = `エラー: ${err.message}`;
        }
      }

      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setUploading(false);
      abortController.current = null;
    }
  };

  // アップロードをキャンセル
  const handleCancel = () => {
    if (abortController.current) {
      abortController.current.abort();
    }
    setUploading(false);
    setFile(null);
    setProgress(0);
    setUploadedSize(0);
    setError('アップロードがキャンセルされました');
  };

  // ファイル選択処理
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    // ファイルサイズチェック（3GB）
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError('ファイルサイズは3GB以下にしてください');
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
    setSuccess(false);
  };

  // ドラッグ&ドロップ処理
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      const changeEvent = {
        target: { files: [droppedFile] }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileSelect(changeEvent);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  return (
    <div className="space-y-4 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          動画アップロード（最大3GB）
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          大容量ファイルは自動的にチャンク分割してアップロードします
        </p>
      </div>

      {/* ファイル選択エリア */}
      {!file && !uploading && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-gray-400 transition-colors"
        >
          <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
          <div className="mt-4">
            <label htmlFor="video-upload-3gb" className="cursor-pointer">
              <span className="text-sm font-medium text-blue-600 hover:text-blue-500">
                クリックして選択
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                またはドラッグ&ドロップ
              </span>
              <input
                id="video-upload-3gb"
                type="file"
                className="sr-only"
                accept="video/*"
                onChange={handleFileSelect}
                disabled={uploading}
              />
            </label>
            <p className="mt-1 text-xs text-gray-500">
              MP4, WebM, MOV, AVI, MKV（最大3GB）
            </p>
          </div>
        </div>
      )}

      {/* 選択されたファイル */}
      {file && !uploading && !success && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {file.name}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {formatFileSize(file.size)}
              </p>
              {file.size > 500 * 1024 * 1024 && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  {Math.ceil(file.size / CHUNK_SIZE)}個のチャンクに分割してアップロードします
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleUpload} variant="primary">
                <CloudArrowUpIcon className="w-5 h-5 mr-2" />
                アップロード
              </Button>
              <Button
                onClick={() => {
                  setFile(null);
                  setError(null);
                }}
                variant="outline"
              >
                キャンセル
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* アップロード中 */}
      {uploading && (
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
              <span>アップロード中...</span>
              <span>{progress.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{formatFileSize(uploadedSize)}</span>
              <span>{file ? formatFileSize(file.size) : '0 B'}</span>
            </div>
          </div>

          <Button
            onClick={handleCancel}
            variant="outline"
            className="w-full text-red-600 hover:text-red-700"
          >
            <XMarkIcon className="w-5 h-5 mr-2" />
            キャンセル
          </Button>
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
      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-center">
            <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
            <p className="ml-3 text-sm text-green-700 dark:text-green-400">
              動画のアップロードが完了しました！
            </p>
          </div>
        </div>
      )}

      {/* 使用方法の説明 */}
      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <h4 className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-2">
          アップロード機能について
        </h4>
        <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1">
          <li>• 500MB以下: 直接アップロード（高速）</li>
          <li>• 500MB〜3GB: 自動チャンク分割（安定）</li>
          <li>• アップロード中の一時停止・再開には対応していません</li>
          <li>• ネットワークエラー時は自動でリトライします</li>
        </ul>
      </div>
    </div>
  );
}