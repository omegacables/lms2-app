'use client';

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/database/supabase';
import { detectUnsupportedVideoCodec } from '@/utils/supabase-storage';
import { Button } from '@/components/ui/Button';
import * as tus from 'tus-js-client';
import {
  CloudArrowUpIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  DocumentIcon,
} from '@heroicons/react/24/outline';

interface BulkVideoUploaderProps {
  courseId: number;
  initialOrderIndex?: number;
  onSuccess?: (uploadedCount: number) => void;
  onCancel?: () => void;
}

type UploadStatus = 'pending' | 'uploading' | 'success' | 'error';

interface QueueItem {
  id: string;
  file: File;
  title: string;
  description: string;
  duration: number;
  progress: number;
  status: UploadStatus;
  errorMessage?: string;
}

const ALLOWED_MIME = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
const MAX_FILE_SIZE = 3 * 1024 * 1024 * 1024; // 3GB

export function BulkVideoUploader({
  courseId,
  initialOrderIndex = 0,
  onSuccess,
  onCancel,
}: BulkVideoUploaderProps) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ファイルサイズフォーマット
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // 動画の再生時間を取得
  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(Math.round(video.duration) || 0);
      };
      video.onerror = () => resolve(0);
      video.src = URL.createObjectURL(file);
    });
  };

  // ファイル追加
  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const newItems: QueueItem[] = [];
    const hevcRejected: string[] = [];

    for (const file of files) {
      // ファイル形式チェック
      if (!ALLOWED_MIME.includes(file.type) && !file.type.startsWith('video/')) {
        console.warn(`[BulkVideoUploader] Skipping non-video file: ${file.name}`);
        continue;
      }
      // ファイルサイズチェック
      if (file.size > MAX_FILE_SIZE) {
        alert(`${file.name} は 3GB を超えているため追加できません。`);
        continue;
      }

      // HEVC/Dolby Vision を検出して拒否（ブラウザで再生できないため）
      const unsupportedCodec = await detectUnsupportedVideoCodec(file);
      if (unsupportedCodec) {
        hevcRejected.push(`${file.name} (${unsupportedCodec.toUpperCase()})`);
        continue;
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      newItems.push({
        id,
        file,
        title: file.name.replace(/\.[^/.]+$/, ''),
        description: '',
        duration: 0,
        progress: 0,
        status: 'pending',
      });
    }

    if (hevcRejected.length > 0) {
      alert(
        `以下のファイルは HEVC (H.265) / Dolby Vision でエンコードされており、` +
        `ブラウザで再生できないためスキップしました:\n\n` +
        hevcRejected.join('\n') +
        `\n\nH.264 (AVC) に再エンコードしてからアップロードしてください。\n` +
        `例: ffmpeg -i input.mp4 -c:v libx264 -c:a aac output.mp4`
      );
    }

    setQueue(prev => [...prev, ...newItems]);

    // 各動画の再生時間を非同期で取得
    for (const item of newItems) {
      getVideoDuration(item.file).then(duration => {
        setQueue(prev =>
          prev.map(q => (q.id === item.id ? { ...q, duration } : q))
        );
      });
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    // 同じファイルを再選択できるようにリセット
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const removeItem = (id: string) => {
    if (isUploading) return;
    setQueue(prev => prev.filter(q => q.id !== id));
  };

  const updateTitle = (id: string, title: string) => {
    setQueue(prev => prev.map(q => (q.id === id ? { ...q, title } : q)));
  };

  // 1件アップロード（TUS で Supabase Storage に直接 → DB INSERT）
  const uploadOne = async (item: QueueItem, orderIndex: number): Promise<boolean> => {
    setQueue(prev => prev.map(q => (q.id === item.id ? { ...q, status: 'uploading', progress: 1 } : q)));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('認証セッションが見つかりません');

      const timestamp = Date.now();
      const safeName = item.file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `course_${courseId}/${timestamp}_${safeName}`;
      const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(item.file, {
          endpoint: `${projectUrl}/storage/v1/upload/resumable`,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            authorization: `Bearer ${session.access_token}`,
            'x-upsert': 'false',
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: 'videos',
            objectName: filePath,
            contentType: item.file.type,
            cacheControl: '3600',
          },
          chunkSize: 6 * 1024 * 1024,
          onError: reject,
          onProgress: (uploaded, total) => {
            const pct = Math.floor((uploaded / total) * 95);
            setQueue(prev => prev.map(q => (q.id === item.id ? { ...q, progress: pct } : q)));
          },
          onSuccess: () => resolve(),
        });
        upload.findPreviousUploads().then(prev => {
          if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
          upload.start();
        });
      });

      const { data: { publicUrl } } = supabase.storage.from('videos').getPublicUrl(filePath);

      const { error: dbError } = await supabase.from('videos').insert({
        course_id: courseId,
        title: item.title || item.file.name,
        description: item.description || null,
        file_url: publicUrl,
        file_size: item.file.size,
        mime_type: item.file.type,
        duration: item.duration || 0,
        order_index: orderIndex,
        status: 'active',
      });

      if (dbError) {
        // 失敗時はストレージから削除（孤児防止）
        await supabase.storage.from('videos').remove([filePath]);
        throw new Error(`データベース保存失敗: ${dbError.message}`);
      }

      setQueue(prev => prev.map(q => (q.id === item.id ? { ...q, status: 'success', progress: 100 } : q)));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[BulkVideoUploader] Upload failed for ${item.file.name}:`, err);
      setQueue(prev =>
        prev.map(q => (q.id === item.id ? { ...q, status: 'error', errorMessage: message } : q))
      );
      return false;
    }
  };

  // 全アップロード（直列で実行 - サーバー負荷を考慮）
  const startUploadAll = async () => {
    if (isUploading) return;
    const pending = queue.filter(q => q.status === 'pending' || q.status === 'error');
    if (pending.length === 0) return;

    setIsUploading(true);
    let successCount = 0;
    let nextOrder = initialOrderIndex;

    for (const item of pending) {
      const ok = await uploadOne(item, nextOrder);
      if (ok) {
        successCount++;
        nextOrder++;
      }
    }

    setIsUploading(false);

    if (successCount > 0 && onSuccess) {
      onSuccess(successCount);
    }
  };

  // 成功した動画を一覧から取り除く（再アップロードに失敗動画だけ残す）
  const clearSuccessful = () => {
    setQueue(prev => prev.filter(q => q.status !== 'success'));
  };

  const totalPending = queue.filter(q => q.status === 'pending').length;
  const totalSuccess = queue.filter(q => q.status === 'success').length;
  const totalError = queue.filter(q => q.status === 'error').length;
  const totalUploading = queue.filter(q => q.status === 'uploading').length;

  return (
    <div className="space-y-4">
      {/* ドロップゾーン */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragOver
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-neutral-700 hover:border-gray-400'
        } ${isUploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={handleDrop}
        onClick={() => !isUploading && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          onChange={handleFileSelect}
          disabled={isUploading}
          className="hidden"
        />
        <CloudArrowUpIcon className="h-10 w-10 mx-auto text-gray-400 mb-2" />
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          動画ファイルをドラッグ＆ドロップ、またはクリックして選択
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          複数選択可 / 1ファイル最大 3GB / MP4, WebM, MOV など
        </p>
      </div>

      {/* キュー */}
      {queue.length > 0 && (
        <>
          <div className="flex items-center justify-between text-sm">
            <div className="text-gray-700 dark:text-gray-300">
              合計 <span className="font-semibold">{queue.length}件</span>
              {totalSuccess > 0 && <span className="ml-2 text-green-600">成功 {totalSuccess}</span>}
              {totalError > 0 && <span className="ml-2 text-red-600">失敗 {totalError}</span>}
              {totalUploading > 0 && <span className="ml-2 text-blue-600">アップロード中 {totalUploading}</span>}
              {totalPending > 0 && <span className="ml-2 text-gray-500">待機 {totalPending}</span>}
            </div>
            {totalSuccess > 0 && !isUploading && (
              <button
                onClick={clearSuccessful}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                成功分をクリア
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto space-y-2 border border-gray-200 dark:border-neutral-800 rounded-lg p-2">
            {queue.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 p-3 rounded-md ${
                  item.status === 'success'
                    ? 'bg-green-50 dark:bg-green-900/10'
                    : item.status === 'error'
                    ? 'bg-red-50 dark:bg-red-900/10'
                    : 'bg-gray-50 dark:bg-neutral-800'
                }`}
              >
                <DocumentIcon className="h-5 w-5 flex-shrink-0 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={item.title}
                    onChange={(e) => updateTitle(item.id, e.target.value)}
                    disabled={isUploading || item.status === 'success'}
                    className="w-full text-sm font-medium bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none text-gray-900 dark:text-white disabled:opacity-70"
                  />
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                    {item.file.name} · {formatFileSize(item.file.size)}
                    {item.duration > 0 && ` · ${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}`}
                  </div>
                  {item.status === 'uploading' && (
                    <div className="mt-2 w-full bg-gray-200 dark:bg-neutral-700 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                  {item.status === 'error' && item.errorMessage && (
                    <p className="text-xs text-red-600 mt-1 truncate" title={item.errorMessage}>
                      {item.errorMessage}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0 flex items-center gap-1">
                  {item.status === 'uploading' && (
                    <span className="text-xs font-medium text-blue-600">{item.progress}%</span>
                  )}
                  {item.status === 'success' && <CheckCircleIcon className="h-5 w-5 text-green-600" />}
                  {item.status === 'error' && <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />}
                  {(item.status === 'pending' || item.status === 'error') && !isUploading && (
                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-neutral-700 rounded"
                      aria-label="削除"
                    >
                      <XMarkIcon className="h-4 w-4 text-gray-500" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* アクションボタン */}
      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={isUploading}>
            {totalSuccess > 0 ? '閉じる' : 'キャンセル'}
          </Button>
        )}
        <Button
          onClick={startUploadAll}
          disabled={isUploading || (totalPending === 0 && totalError === 0)}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isUploading
            ? `アップロード中... (${totalSuccess}/${queue.length})`
            : totalError > 0
            ? `失敗したものを再試行 (${totalError + totalPending}件)`
            : `${totalPending}件をアップロード`}
        </Button>
      </div>
    </div>
  );
}
