'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/database/supabase';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  CloudArrowUpIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface VideoUploaderProps {
  courseId: number;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

const MAX_FILE_SIZE = 3 * 1024 * 1024 * 1024; // 3GB

export function VideoUploader({ courseId, onSuccess, onError }: VideoUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const [orderIndex, setOrderIndex] = useState(1);

  // ファイルサイズをフォーマット
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // 動画の長さを取得
  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';

      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        const duration = Math.round(video.duration);
        console.log('動画の長さを取得:', duration, '秒');
        resolve(duration);
      };

      video.onerror = () => {
        console.warn('動画の長さを取得できませんでした');
        resolve(0);
      };

      video.src = URL.createObjectURL(file);
    });
  };

  // ファイル選択ハンドラー
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // ファイルサイズチェック
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(`ファイルサイズが大きすぎます。最大3GBまでアップロード可能です。`);
      return;
    }

    // ファイルタイプチェック
    if (!selectedFile.type.startsWith('video/')) {
      setError('動画ファイルを選択してください。');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setSuccess(false);

    // ファイル名からタイトルを自動設定
    if (!videoTitle) {
      const titleFromFile = selectedFile.name.replace(/\.[^/.]+$/, '');
      setVideoTitle(titleFromFile);
    }
  }, [videoTitle]);

  // アップロード処理
  const handleUpload = async () => {
    if (!file) {
      setError('ファイルを選択してください。');
      return;
    }

    if (!videoTitle.trim()) {
      setError('動画タイトルを入力してください。');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      // 認証チェック
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('ログインが必要です。');
      }

      // 動画の長さを取得
      const duration = await getVideoDuration(file);
      console.log('取得した動画の長さ:', duration);

      // ファイル名を安全な形式に変換
      const timestamp = Date.now();
      const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `course_${courseId}/${timestamp}_${safeFileName}`;

      console.log('アップロード開始:', filePath);

      // Supabaseストレージにアップロード
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('videos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('アップロードエラー:', uploadError);
        throw new Error(`アップロードに失敗しました: ${uploadError.message}`);
      }

      console.log('アップロード成功:', uploadData);

      // 公開URLを取得
      const { data: { publicUrl } } = supabase.storage
        .from('videos')
        .getPublicUrl(filePath);

      console.log('公開URL:', publicUrl);

      // データベースに動画情報を保存
      const videoData = {
        course_id: courseId,
        title: videoTitle.trim(),
        description: videoDescription.trim() || null,
        file_url: publicUrl,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
        duration: duration, // 取得した動画の長さを保存
        order_index: orderIndex,
        status: 'active' as const,
        metadata: {
          originalName: file.name,
          uploadedAt: new Date().toISOString(),
          uploadedBy: session.user.id
        }
      };

      console.log('データベースに保存する動画データ:', videoData);

      const { data: insertedVideo, error: dbError } = await supabase
        .from('videos')
        .insert(videoData)
        .select()
        .single();

      if (dbError) {
        console.error('データベースエラー:', dbError);
        // エラー時はアップロードしたファイルを削除
        await supabase.storage.from('videos').remove([filePath]);
        throw new Error(`データベースへの保存に失敗しました: ${dbError.message}`);
      }

      console.log('データベース保存成功:', insertedVideo);

      setSuccess(true);
      setUploadProgress(100);

      // 成功時のコールバック
      onSuccess?.();

      // 3秒後にリセット
      setTimeout(() => {
        setFile(null);
        setVideoTitle('');
        setVideoDescription('');
        setUploadProgress(0);
        setSuccess(false);
        setError(null);
      }, 3000);

    } catch (err) {
      console.error('アップロードエラー:', err);
      setError(err instanceof Error ? err.message : 'アップロードに失敗しました');
      onError?.(err instanceof Error ? err : new Error('アップロードに失敗しました'));
    } finally {
      setUploading(false);
    }
  };

  // ドラッグ＆ドロップ
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const event = {
        target: { files: [droppedFile] }
      } as any;
      handleFileSelect(event);
    }
  };

  return (
    <div className="w-full">
      {/* ファイル選択エリア */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          file ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 dark:border-gray-600'
        } ${uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-400'}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
          disabled={uploading}
          className="hidden"
          id="video-upload"
        />

        <label htmlFor="video-upload" className={uploading ? 'cursor-not-allowed' : 'cursor-pointer'}>
          {file ? (
            <div className="space-y-2">
              <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-lg font-medium text-gray-900 dark:text-white">{file.name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                サイズ: {formatFileSize(file.size)}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <CloudArrowUpIcon className="h-12 w-12 text-gray-400 mx-auto" />
              <p className="text-lg font-medium text-gray-900 dark:text-white">
                クリックまたはドラッグ＆ドロップで動画を選択
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                最大3GBまでアップロード可能
              </p>
            </div>
          )}
        </label>
      </div>

      {/* 動画情報入力 */}
      {file && !uploading && !success && (
        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              動画タイトル <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
              placeholder="動画のタイトルを入力"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              説明（任意）
            </label>
            <textarea
              value={videoDescription}
              onChange={(e) => setVideoDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
              rows={3}
              placeholder="動画の説明を入力"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              表示順序
            </label>
            <input
              type="number"
              value={orderIndex}
              onChange={(e) => setOrderIndex(parseInt(e.target.value) || 1)}
              min="1"
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
        </div>
      )}

      {/* エラーメッセージ */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mr-2" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* 成功メッセージ */}
      {success && (
        <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center">
            <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
            <p className="text-sm text-green-700 dark:text-green-400">
              動画が正常にアップロードされました！
            </p>
          </div>
        </div>
      )}

      {/* アップロード中の進捗 */}
      {uploading && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">アップロード中...</span>
            <span className="text-sm font-medium">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* アップロードボタン */}
      {file && !uploading && !success && (
        <div className="mt-6 flex justify-end space-x-3">
          <Button
            variant="outline"
            onClick={() => {
              setFile(null);
              setVideoTitle('');
              setVideoDescription('');
              setError(null);
            }}
          >
            キャンセル
          </Button>
          <Button onClick={handleUpload}>
            <CloudArrowUpIcon className="h-4 w-4 mr-2" />
            アップロード
          </Button>
        </div>
      )}

      {/* アップロード中のローディング */}
      {uploading && (
        <div className="mt-6 flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
      )}
    </div>
  );
}