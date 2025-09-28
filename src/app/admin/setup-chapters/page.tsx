'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

export default function SetupChaptersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [tableExists, setTableExists] = useState<boolean | null>(null);

  const handleSetupChapters = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/admin/create-chapters-table', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to setup chapters');
        setResult(data);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError('Network error: ' + (err as Error).message);
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">チャプター機能のセットアップ</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              チャプター機能を使用するために必要なテーブルとカラムを確認・作成します
            </p>
          </div>

          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">必要なデータベース構造</h2>

            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">chaptersテーブル</h3>
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-neutral-800">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">カラム名</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">型</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">説明</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-gray-700">
                    <tr>
                      <td className="px-4 py-2 text-sm">id</td>
                      <td className="px-4 py-2 text-sm">uuid</td>
                      <td className="px-4 py-2 text-sm">主キー (gen_random_uuid())</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-sm">course_id</td>
                      <td className="px-4 py-2 text-sm">integer</td>
                      <td className="px-4 py-2 text-sm">コースID (外部キー)</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-sm">title</td>
                      <td className="px-4 py-2 text-sm">text</td>
                      <td className="px-4 py-2 text-sm">チャプタータイトル</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-sm">display_order</td>
                      <td className="px-4 py-2 text-sm">integer</td>
                      <td className="px-4 py-2 text-sm">表示順 (デフォルト: 0)</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-sm">created_at</td>
                      <td className="px-4 py-2 text-sm">timestamptz</td>
                      <td className="px-4 py-2 text-sm">作成日時 (now())</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-sm">updated_at</td>
                      <td className="px-4 py-2 text-sm">timestamptz</td>
                      <td className="px-4 py-2 text-sm">更新日時 (now())</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className="font-medium mb-2">videosテーブルへの追加カラム</h3>
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-neutral-800">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">カラム名</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">型</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">説明</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-gray-700">
                    <tr>
                      <td className="px-4 py-2 text-sm">chapter_id</td>
                      <td className="px-4 py-2 text-sm">uuid</td>
                      <td className="px-4 py-2 text-sm">チャプターID (外部キー, nullable)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-6">
            <div className="space-y-4">
              <Button
                onClick={handleSetupChapters}
                loading={loading}
                disabled={loading}
                className="w-full"
              >
                チャプターテーブルの状態を確認
              </Button>

              {/* Success Message */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-600 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800 dark:text-green-200">
                      チャプターテーブルが作成されました
                    </h3>
                    <div className="mt-2 text-sm text-green-700 dark:text-green-300">
                      <p>SQLコマンドを実行してチャプターテーブルが作成されました。</p>
                      <p className="mt-2">
                        <Link
                          href={`/admin/courses`}
                          className="underline hover:text-green-800 dark:hover:text-green-100"
                        >
                          コース管理画面に戻る
                        </Link>
                        から、動画管理ページでチャプター機能を使用できます。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {result && (
            <div className={`mt-6 p-4 rounded-lg ${result.error ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
              <pre className="text-sm whitespace-pre-wrap">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <h3 className="font-semibold mb-2">手動セットアップ手順</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              Supabaseダッシュボードで以下のSQLを実行してください：
            </p>
            <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs overflow-x-auto">
{`-- チャプターテーブルの作成
CREATE TABLE IF NOT EXISTS chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックスの作成
CREATE INDEX idx_chapters_course_id ON chapters(course_id);
CREATE INDEX idx_chapters_display_order ON chapters(display_order);

-- videosテーブルにchapter_idカラムを追加
ALTER TABLE videos
ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL;

-- インデックスの作成
CREATE INDEX idx_videos_chapter_id ON videos(chapter_id);

-- RLSポリシーの設定
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;

-- 全ユーザーが読み取り可能
CREATE POLICY "chapters_read_all" ON chapters
  FOR SELECT USING (true);

-- 管理者とインストラクターのみ変更可能
CREATE POLICY "chapters_insert" ON chapters
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'instructor')
    )
  );

CREATE POLICY "chapters_update" ON chapters
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'instructor')
    )
  );

CREATE POLICY "chapters_delete" ON chapters
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'instructor')
    )
  );`}
            </pre>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}