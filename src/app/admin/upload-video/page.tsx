'use client';

import { useParams, useRouter } from 'next/navigation';
import { AdminGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { VideoUploader } from '@/components/admin/VideoUploader';
import { Button } from '@/components/ui/Button';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

export default function UploadVideoPage() {
  const router = useRouter();
  const [courseId, setCourseId] = useState<string>('');

  const handleSuccess = () => {
    alert('動画のアップロードが完了しました！');
    router.push('/admin/courses');
  };

  const handleError = (error: Error) => {
    console.error('Upload error:', error);
    alert(`アップロードエラー: ${error.message}`);
  };

  return (
    <AdminGuard>
      <MainLayout>
        <div className="max-w-4xl mx-auto p-6">
          {/* ヘッダー */}
          <div className="mb-6">
            <Button
              variant="outline"
              onClick={() => router.back()}
              className="mb-4"
            >
              <ArrowLeftIcon className="w-4 h-4 mr-2" />
              戻る
            </Button>

            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              動画アップロード
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              動画を直接Supabaseにアップロードします
            </p>
          </div>

          {/* コースID入力 */}
          <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              コースID <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              placeholder="アップロード先のコースIDを入力..."
              min="1"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              動画を追加するコースのIDを入力してください
            </p>
          </div>

          {/* アップローダー */}
          {courseId ? (
            <VideoUploader
              courseId={parseInt(courseId)}
              onSuccess={handleSuccess}
              onError={handleError}
            />
          ) : (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-8 text-center">
              <p className="text-gray-600 dark:text-gray-400">
                コースIDを入力すると、アップローダーが表示されます
              </p>
            </div>
          )}

          {/* 説明 */}
          <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <h3 className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-2">
              このページの特徴
            </h3>
            <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1">
              <li>• Vercelを経由せず、直接Supabaseにアップロード</li>
              <li>• 413エラーを完全に回避</li>
              <li>• 最大3GBまでの動画に対応</li>
              <li>• 動画の長さを自動的に取得</li>
            </ul>
          </div>
        </div>
      </MainLayout>
    </AdminGuard>
  );
}