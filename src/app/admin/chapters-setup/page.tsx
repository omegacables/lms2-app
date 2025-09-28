'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ChaptersSetupPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const router = useRouter();

  const createTables = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/create-chapters-table-v2', {
        method: 'POST'
      });

      const data = await response.json();
      setResult(data);

      if (data.success) {
        alert('チャプターテーブルが正常に作成されました');
      }
    } catch (error) {
      console.error('Error creating tables:', error);
      setResult({ error: 'テーブル作成中にエラーが発生しました' });
    } finally {
      setLoading(false);
    }
  };

  const checkTables = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/create-chapters-table-v2');
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Error checking tables:', error);
      setResult({ error: 'テーブル確認中にエラーが発生しました' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">チャプター機能セットアップ</h1>
        <p className="text-gray-600">
          新しいチャプター管理システムをセットアップします
        </p>
      </div>

      {/* ステップ1: テーブル作成 */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">ステップ1: データベース準備</h2>

        <div className="space-y-4">
          <div className="flex gap-4">
            <button
              onClick={createTables}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '処理中...' : 'テーブルを作成'}
            </button>
            <button
              onClick={checkTables}
              disabled={loading}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? '確認中...' : 'テーブル状態を確認'}
            </button>
          </div>

          {result && (
            <div className="mt-4 p-4 bg-gray-50 rounded">
              <pre className="text-xs overflow-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* ステップ2: 使用方法 */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">ステップ2: 使用方法</h2>

        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>上記の「テーブルを作成」ボタンをクリック</li>
          <li>成功メッセージが表示されるまで待つ</li>
          <li>
            エラーが出た場合は、Supabaseの管理画面から以下のSQLを実行:
            <pre className="mt-2 p-2 bg-gray-100 text-xs rounded overflow-auto">
{`-- チャプターテーブル
CREATE TABLE chapters (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 中間テーブル
CREATE TABLE chapter_videos (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(chapter_id, video_id)
);`}
            </pre>
          </li>
          <li>コース編集画面でチャプターを管理</li>
        </ol>
      </div>

      {/* ナビゲーション */}
      <div className="flex gap-4">
        <button
          onClick={() => router.push('/admin/courses')}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          コース管理へ
        </button>
        <button
          onClick={() => router.push('/admin')}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          管理画面トップへ
        </button>
      </div>
    </div>
  );
}