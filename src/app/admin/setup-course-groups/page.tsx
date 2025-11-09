'use client';

import { useState } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { CheckCircleIcon, XCircleIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';

export default function SetupCourseGroupsPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const handleSetup = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/admin/create-course-groups', {
        method: 'POST',
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('セットアップエラー:', error);
      setResult({
        success: false,
        error: 'セットアップに失敗しました',
        details: error
      });
    } finally {
      setLoading(false);
    }
  };

  const copySQLToClipboard = () => {
    if (result?.sql) {
      navigator.clipboard.writeText(result.sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              コースグループ機能のセットアップ
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              コースグループ機能を使用するための データベーステーブルを作成します
            </p>
          </div>

          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              機能概要
            </h2>
            <ul className="space-y-2 text-gray-600 dark:text-gray-400">
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>複数のコースをグループ化して管理</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>グループ内でコースの順序を設定</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>前のコースを完了しないと次のコースがアンロックされない機能</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>学習パスの作成と管理</span>
              </li>
            </ul>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-6 mb-6">
            <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-400 mb-4">
              作成されるテーブル
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-blue-900 dark:text-blue-300 mb-2">
                  1. course_groups（コースグループ）
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-400">
                  グループの基本情報（タイトル、説明、順次アンロック設定など）
                </p>
              </div>
              <div>
                <h3 className="font-medium text-blue-900 dark:text-blue-300 mb-2">
                  2. course_group_items（グループ内のコース）
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-400">
                  どのコースがどのグループに属しているか、順序情報
                </p>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800 p-6 mb-6">
            <h2 className="text-lg font-semibold text-yellow-900 dark:text-yellow-400 mb-2">
              注意事項
            </h2>
            <p className="text-sm text-yellow-800 dark:text-yellow-400">
              既存のデータには一切影響しません。新しいテーブルのみを追加します。
            </p>
          </div>

          <div className="flex justify-center mb-6">
            <Button
              onClick={handleSetup}
              disabled={loading}
              className="px-8 py-3"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  確認中...
                </>
              ) : (
                'セットアップを開始'
              )}
            </Button>
          </div>

          {result && (
            <div className={`rounded-lg border p-6 ${
              result.success
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
            }`}>
              <div className="flex items-start mb-4">
                {result.success ? (
                  <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400 mr-2 flex-shrink-0" />
                ) : (
                  <XCircleIcon className="h-6 w-6 text-gray-600 dark:text-gray-400 mr-2 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <h3 className={`font-semibold mb-2 ${
                    result.success
                      ? 'text-green-900 dark:text-green-400'
                      : 'text-gray-900 dark:text-gray-100'
                  }`}>
                    {result.message}
                  </h3>

                  {result.sql && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          以下のSQLをSupabase管理画面で実行してください:
                        </p>
                        <button
                          onClick={copySQLToClipboard}
                          className="flex items-center px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
                        >
                          <DocumentDuplicateIcon className="h-4 w-4 mr-1" />
                          {copied ? 'コピーしました!' : 'コピー'}
                        </button>
                      </div>
                      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                        {result.sql}
                      </pre>

                      {result.instructions && (
                        <div className="mt-4 space-y-2">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">実行手順:</p>
                          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                            {result.instructions.map((instruction: string, index: number) => (
                              <li key={index}>{instruction}</li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>
                  )}

                  {result.tables && (
                    <div className="mt-4">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        作成されたテーブル: {result.tables.join(', ')}
                      </p>
                    </div>
                  )}

                  {result.error && (
                    <div className="mt-4">
                      <p className="text-sm text-red-600 dark:text-red-400">
                        エラー: {result.error}
                      </p>
                      {result.details && (
                        <pre className="mt-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 p-2 rounded overflow-x-auto">
                          {JSON.stringify(result.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
