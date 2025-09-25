'use client';

import { useState } from 'react';
import { supabase } from '@/lib/database/supabase';
import { Button } from '@/components/ui/Button';
import { CloudArrowUpIcon } from '@heroicons/react/24/outline';

interface VideoUploadDirectProps {
  courseId: number;
  onSuccess?: () => void;
}

export function VideoUploadDirect({ courseId, onSuccess }: VideoUploadDirectProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleDirectUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      // ファイル名を生成（タイムスタンプ付き）
      const timestamp = Date.now();
      const fileName = `course_${courseId}/${timestamp}_${file.name}`;

      // Supabase Storageに直接アップロード
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('videos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
          onUploadProgress: (progress) => {
            const percent = (progress.loaded / progress.total) * 100;
            setProgress(Math.round(percent));
          },
        });

      if (uploadError) {
        throw uploadError;
      }

      // URLを取得
      const { data: { publicUrl } } = supabase.storage
        .from('videos')
        .getPublicUrl(fileName);

      // データベースに動画情報を保存
      const { error: dbError } = await supabase
        .from('videos')
        .insert({
          course_id: courseId,
          title: file.name.replace(/\.[^/.]+$/, ''), // 拡張子を除去
          description: '',
          url: publicUrl,
          duration: 0, // 後で更新可能
          order_index: 999, // 最後に追加
          status: 'active',
        });

      if (dbError) {
        // アップロードしたファイルを削除
        await supabase.storage.from('videos').remove([fileName]);
        throw dbError;
      }

      setProgress(100);
      onSuccess?.();

      // リセット
      setTimeout(() => {
        setProgress(0);
        setUploading(false);
      }, 1000);

    } catch (err) {
      console.error('Direct upload error:', err);
      setError(err instanceof Error ? err.message : '動画のアップロードに失敗しました');
      setUploading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // ファイルサイズチェック（500MB）
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('ファイルサイズは500MB以下にしてください');
      return;
    }

    // ファイル形式チェック
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
    if (!allowedTypes.includes(file.type)) {
      setError('対応していないファイル形式です（MP4, WebM, MOV, AVIのみ）');
      return;
    }

    handleDirectUpload(file);
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-2">
          Supabase Storage 直接アップロード
        </h3>
        <p className="text-sm text-blue-700 dark:text-blue-400">
          大きいファイルの場合はこちらを使用してください（最大500MB）
        </p>
      </div>

      <div>
        <input
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
          disabled={uploading}
          className="hidden"
          id="video-upload-direct"
        />
        <label htmlFor="video-upload-direct">
          <Button
            as="span"
            variant="outline"
            disabled={uploading}
            className="cursor-pointer"
          >
            <CloudArrowUpIcon className="w-5 h-5 mr-2" />
            {uploading ? `アップロード中... ${progress}%` : '動画ファイルを選択'}
          </Button>
        </label>
      </div>

      {uploading && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>アップロード進捗</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}