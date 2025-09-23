'use client';

import { useState } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  CloudArrowUpIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface BucketStatus {
  bucket: string;
  status: 'created' | 'exists' | 'error';
  message: string;
}

export default function StorageSetupPage() {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<BucketStatus[]>([]);
  const [existingBuckets, setExistingBuckets] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const checkBuckets = async () => {
    setChecking(true);
    setError(null);
    
    try {
      const response = await fetch('/api/admin/storage/init', {
        method: 'GET'
      });

      const data = await response.json();

      if (data.success) {
        setExistingBuckets(data.buckets || []);
      } else {
        setError(data.error || 'バケットの確認に失敗しました');
      }
    } catch (error) {
      console.error('Check error:', error);
      setError('バケットの確認中にエラーが発生しました');
    } finally {
      setChecking(false);
    }
  };

  const initializeStorage = async () => {
    setLoading(true);
    setError(null);
    setResults([]);
    
    try {
      const response = await fetch('/api/admin/storage/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        setResults(data.results || []);
        // 初期化後、バケット一覧を再取得
        await checkBuckets();
      } else {
        setError(data.error || 'ストレージの初期化に失敗しました');
      }
    } catch (error) {
      console.error('Initialization error:', error);
      setError('ストレージの初期化中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'created':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'exists':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
      case 'error':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'created':
        return 'text-green-700 bg-green-50 dark:bg-green-900/20';
      case 'exists':
        return 'text-yellow-700 bg-yellow-50 dark:bg-yellow-900/20';
      case 'error':
        return 'text-red-700 bg-red-50 dark:bg-red-900/20';
      default:
        return 'text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-black';
    }
  };

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ストレージ設定</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Supabaseストレージバケットの初期化と設定を行います
            </p>
          </div>

          <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ストレージバケット初期化</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  必要なストレージバケットを自動的に作成します
                </p>
              </div>
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={checkBuckets}
                  disabled={checking || loading}
                  loading={checking}
                >
                  バケット確認
                </Button>
                <Button
                  onClick={initializeStorage}
                  disabled={loading || checking}
                  loading={loading}
                >
                  <CloudArrowUpIcon className="h-4 w-4 mr-2" />
                  初期化実行
                </Button>
              </div>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg">
                <div className="flex items-center">
                  <XCircleIcon className="h-5 w-5 text-red-500 mr-2" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            )}

            {/* 既存バケット一覧 */}
            {existingBuckets.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">既存のバケット</h3>
                <div className="space-y-2">
                  {existingBuckets.map((bucket, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-black rounded-lg"
                    >
                      <div>
                        <span className="font-medium text-gray-900 dark:text-white">{bucket.name || bucket.id}</span>
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                          {bucket.public ? 'Public' : 'Private'}
                        </span>
                      </div>
                      <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 初期化結果 */}
            {results.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">初期化結果</h3>
                <div className="space-y-2">
                  {results.map((result, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-3 rounded-lg ${getStatusColor(result.status)}`}
                    >
                      <div className="flex items-center">
                        {getStatusIcon(result.status)}
                        <div className="ml-3">
                          <span className="font-medium">{result.bucket}</span>
                          <span className="ml-2 text-sm opacity-75">
                            {result.message}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 作成予定のバケット情報 */}
            {results.length === 0 && !loading && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">作成予定のバケット</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <h4 className="font-medium text-blue-900">videos</h4>
                    <p className="text-sm text-blue-700 mt-1">
                      動画ファイル用 (最大3GB, Private)
                    </p>
                  </div>
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <h4 className="font-medium text-blue-900">thumbnails</h4>
                    <p className="text-sm text-blue-700 mt-1">
                      サムネイル画像用 (最大10MB, Public)
                    </p>
                  </div>
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <h4 className="font-medium text-blue-900">avatars</h4>
                    <p className="text-sm text-blue-700 mt-1">
                      プロフィール画像用 (最大5MB, Public)
                    </p>
                  </div>
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <h4 className="font-medium text-blue-900">certificates</h4>
                    <p className="text-sm text-blue-700 mt-1">
                      証明書PDF用 (最大50MB, Private)
                    </p>
                  </div>
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <h4 className="font-medium text-blue-900">attachments</h4>
                    <p className="text-sm text-blue-700 mt-1">
                      添付ファイル用 (最大100MB, Private)
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 注意事項 */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 rounded-xl p-6">
            <h3 className="text-sm font-medium text-yellow-900 mb-2">注意事項</h3>
            <ul className="text-sm text-yellow-800 space-y-1">
              <li>• この操作は管理者権限が必要です</li>
              <li>• Service Role Keyが環境変数に設定されている必要があります</li>
              <li>• 既存のバケットは上書きされません</li>
              <li>• Supabaseダッシュボードで手動で作成することも可能です</li>
            </ul>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}