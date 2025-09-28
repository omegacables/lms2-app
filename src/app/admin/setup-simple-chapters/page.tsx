'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export default function SetupSimpleChaptersPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSetup = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/admin/add-chapter-columns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'セットアップに失敗しました');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError('ネットワークエラー: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-4xl mx-auto p-6">
          <div className="mb-6">
            <Link
              href="/admin"
              className="inline-flex items-center text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white mb-4"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-2" />
              管理画面に戻る
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              シンプルチャプター機能のセットアップ
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              データベースエラーを回避する、シンプルなチャプター機能をセットアップします
            </p>
          </div>

          {/* メリットの説明 */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 text-blue-800 dark:text-blue-200">
              ✨ シンプルチャプター機能のメリット
            </h2>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li>✅ 複雑なテーブル結合が不要</li>
              <li>✅ RLSポリシーエラーが発生しない</li>
              <li>✅ 動画テーブルのみで完結</li>
              <li>✅ パフォーマンスが向上</li>
              <li>✅ メンテナンスが簡単</li>
            </ul>
          </div>

          {/* セットアップボタン */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">自動セットアップ</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              以下のボタンをクリックすると、必要なカラムが自動的に追加されます：
            </p>
            <ul className="list-disc list-inside mb-4 text-sm text-gray-600 dark:text-gray-400">
              <li>動画テーブル: chapter_title, chapter_order カラム</li>
              <li>コーステーブル: display_order カラム（並び替え用）</li>
            </ul>
            <Button
              onClick={handleSetup}
              loading={loading}
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              🚀 自動セットアップを実行
            </Button>
          </div>

          {/* 結果表示 */}
          {result && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold mb-2 text-green-800 dark:text-green-200">
                ✅ セットアップ完了
              </h3>
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                以下の機能が利用可能になりました：
              </p>
              <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400">
                <li>動画にチャプター名を設定可能</li>
                <li>チャプターごとに動画をグループ化</li>
                <li>コースの並び替えが可能</li>
              </ul>
              <div className="mt-4">
                <Link
                  href="/admin/courses"
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 underline"
                >
                  コース管理画面へ移動 →
                </Link>
              </div>
            </div>
          )}

          {/* エラー表示 */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold mb-2 text-red-800 dark:text-red-200">
                ❌ エラー
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                {error}
              </p>
            </div>
          )}

          {/* 詳細情報 */}
          {result && result.details && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6">
              <h4 className="font-semibold mb-2">技術詳細</h4>
              <pre className="text-xs overflow-x-auto">
                {JSON.stringify(result.details, null, 2)}
              </pre>
            </div>
          )}

          {/* 手動セットアップ */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
            <h3 className="font-semibold mb-2">手動セットアップ（Supabase SQL Editor）</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              自動セットアップがうまくいかない場合は、以下のSQLを実行してください：
            </p>
            <pre className="bg-gray-900 text-green-400 p-4 rounded text-xs overflow-x-auto">
{`-- 動画テーブルにチャプター機能を追加
ALTER TABLE videos
ADD COLUMN IF NOT EXISTS chapter_title TEXT,
ADD COLUMN IF NOT EXISTS chapter_order INTEGER DEFAULT 0;

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_videos_chapter_title
ON videos(chapter_title);
CREATE INDEX IF NOT EXISTS idx_videos_chapter_order
ON videos(chapter_order);

-- コーステーブルに並び順を追加
ALTER TABLE courses
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_courses_display_order
ON courses(display_order);`}
            </pre>
          </div>

          {/* 使い方の説明 */}
          <div className="mt-6 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-6">
            <h3 className="font-semibold mb-2">📝 使い方</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li>上記のセットアップを実行</li>
              <li>コース管理画面で動画を編集</li>
              <li>各動画に「チャプター名」を設定（同じ名前でグループ化）</li>
              <li>「チャプター順序」を設定してチャプターの並び順を管理</li>
              <li>コース一覧でドラッグ＆ドロップでコースを並び替え</li>
            </ol>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}