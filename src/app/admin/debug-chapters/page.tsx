'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function DebugChaptersPage() {
  const [loading, setLoading] = useState(false);
  const [metadataInfo, setMetadataInfo] = useState<any>(null);
  const [sqlExecuteResult, setSqlExecuteResult] = useState<string>('');

  const checkMetadata = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/debug/check-metadata');
      const data = await response.json();
      setMetadataInfo(data);
      console.log('Metadata check result:', data);
    } catch (error) {
      console.error('Error checking metadata:', error);
      setMetadataInfo({ error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  };

  const addMetadataColumn = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/debug/add-metadata-column', {
        method: 'POST',
      });
      const data = await response.json();
      setSqlExecuteResult(JSON.stringify(data, null, 2));
      console.log('Add metadata column result:', data);

      // 再度チェック
      await checkMetadata();
    } catch (error) {
      console.error('Error adding metadata column:', error);
      setSqlExecuteResult(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const testChapterAPI = async (courseId: string) => {
    try {
      const response = await fetch(`/api/courses/${courseId}/chapters`);
      const data = await response.json();
      console.log(`Chapter API response for course ${courseId}:`, data);
      alert(`Chapter API Response:\n${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      console.error('Error testing chapter API:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  useEffect(() => {
    checkMetadata();
  }, []);

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              チャプター機能デバッグ
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              データベースのmetadataカラムとチャプター機能の状態を確認
            </p>
          </div>

          <div className="space-y-6">
            {/* コントロールボタン */}
            <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                操作
              </h2>
              <div className="flex space-x-4">
                <Button onClick={checkMetadata} disabled={loading}>
                  メタデータを再チェック
                </Button>
                <Button onClick={addMetadataColumn} disabled={loading} className="bg-yellow-600 hover:bg-yellow-700">
                  metadataカラムを追加（SQLを実行）
                </Button>
              </div>
              {sqlExecuteResult && (
                <div className="mt-4 p-4 bg-gray-100 dark:bg-neutral-800 rounded-lg">
                  <pre className="text-xs overflow-auto">{sqlExecuteResult}</pre>
                </div>
              )}
            </div>

            {/* メタデータ情報 */}
            {loading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner size="lg" />
              </div>
            ) : metadataInfo ? (
              <>
                <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    データベース状態
                  </h2>
                  <div className="space-y-2">
                    <div>
                      <span className="font-medium">metadataカラム存在: </span>
                      <span className={metadataInfo.hasMetadataColumn ? 'text-green-600' : 'text-red-600'}>
                        {metadataInfo.hasMetadataColumn ? '✅ 存在する' : '❌ 存在しない'}
                      </span>
                    </div>
                    {metadataInfo.firstCourse && (
                      <div>
                        <span className="font-medium">テーブルカラム: </span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {metadataInfo.firstCourse.allColumns.join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 各コースのメタデータ状態 */}
                <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    各コースのメタデータ状態
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-800">
                      <thead>
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">タイトル</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Metadata</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">チャプター数</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">内容</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-neutral-800">
                        {metadataInfo.courseMetadataInfo?.map((course: any) => (
                          <tr key={course.id}>
                            <td className="px-4 py-2 text-sm">{course.id}</td>
                            <td className="px-4 py-2 text-sm">{course.title}</td>
                            <td className="px-4 py-2 text-sm">
                              {course.hasMetadata ? '✅' : '❌'}
                            </td>
                            <td className="px-4 py-2 text-sm">{course.chaptersCount}</td>
                            <td className="px-4 py-2 text-sm">
                              <details>
                                <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                                  詳細を表示
                                </summary>
                                <pre className="text-xs mt-2 p-2 bg-gray-100 dark:bg-neutral-800 rounded overflow-auto">
                                  {JSON.stringify(course.metadataContent, null, 2)}
                                </pre>
                              </details>
                            </td>
                            <td className="px-4 py-2 text-sm">
                              <Button
                                size="sm"
                                onClick={() => testChapterAPI(course.id)}
                                className="bg-blue-600 hover:bg-blue-700"
                              >
                                APIテスト
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 生データ表示 */}
                <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    生データ（デバッグ用）
                  </h2>
                  <pre className="text-xs overflow-auto p-4 bg-gray-100 dark:bg-neutral-800 rounded">
                    {JSON.stringify(metadataInfo, null, 2)}
                  </pre>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}