'use client';

import { useState } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { ClipboardDocumentIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

export default function SetupGroupEnrollmentsPage() {
  const [copied, setCopied] = useState(false);

  const sqlScript = `-- ユーザーグループ登録テーブル
CREATE TABLE IF NOT EXISTS user_group_enrollments (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id BIGINT NOT NULL REFERENCES course_groups(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  enrolled_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, group_id)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_user_group_enrollments_user_id ON user_group_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_group_enrollments_group_id ON user_group_enrollments(group_id);

-- RLS有効化
ALTER TABLE user_group_enrollments ENABLE ROW LEVEL SECURITY;

-- ポリシー作成：読み取り（自分のデータまたは管理者）
CREATE POLICY "ユーザーは自分の登録を閲覧可能" ON user_group_enrollments
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('instructor', 'admin')
    )
  );

-- ポリシー作成：管理者のみ作成・更新・削除
CREATE POLICY "管理者はグループ登録を管理可能" ON user_group_enrollments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('instructor', 'admin')
    )
  );

-- コメント追加
COMMENT ON TABLE user_group_enrollments IS 'ユーザーのコースグループ登録情報';
COMMENT ON COLUMN user_group_enrollments.user_id IS '登録ユーザーID';
COMMENT ON COLUMN user_group_enrollments.group_id IS 'コースグループID';
COMMENT ON COLUMN user_group_enrollments.enrolled_at IS '登録日時';
COMMENT ON COLUMN user_group_enrollments.enrolled_by IS '登録者（管理者）ID';
`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sqlScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('コピーに失敗しました:', error);
      alert('コピーに失敗しました');
    }
  };

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              グループ登録テーブルセットアップ
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              ユーザーグループ登録機能を有効にするために、以下のSQLスクリプトをSupabaseで実行してください。
            </p>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-300 mb-3">
              📋 セットアップ手順
            </h2>
            <ol className="list-decimal list-inside space-y-2 text-blue-800 dark:text-blue-400">
              <li>下のSQLスクリプトをコピー</li>
              <li>Supabaseダッシュボード → SQL Editor を開く</li>
              <li>新規クエリを作成してスクリプトを貼り付け</li>
              <li>「Run」をクリックして実行</li>
              <li>正常に完了したら、グループ割当機能が使えるようになります</li>
            </ol>
          </div>

          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-neutral-800 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">SQLスクリプト</h3>
              <Button
                onClick={handleCopy}
                variant="secondary"
                className="flex items-center"
              >
                {copied ? (
                  <>
                    <CheckCircleIcon className="h-4 w-4 mr-2 text-green-600" />
                    コピーしました！
                  </>
                ) : (
                  <>
                    <ClipboardDocumentIcon className="h-4 w-4 mr-2" />
                    コピー
                  </>
                )}
              </Button>
            </div>
            <div className="p-4">
              <pre className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-4 overflow-x-auto text-sm">
                <code className="text-gray-800 dark:text-gray-200">{sqlScript}</code>
              </pre>
            </div>
          </div>

          <div className="mt-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-900 dark:text-yellow-300 mb-2">
              ⚠️ 注意事項
            </h3>
            <ul className="list-disc list-inside space-y-1 text-yellow-800 dark:text-yellow-400 text-sm">
              <li>このスクリプトは既存のデータに影響を与えません</li>
              <li>既存のコース割当（course_assignments）は完全に保護されます</li>
              <li>視聴履歴やユーザーデータは変更されません</li>
              <li>course_groupsテーブルが先に作成されている必要があります</li>
            </ul>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <a
              href="/admin/courses"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              ← コース管理に戻る
            </a>
            <a
              href="https://app.supabase.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Supabaseダッシュボードを開く →
            </a>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
