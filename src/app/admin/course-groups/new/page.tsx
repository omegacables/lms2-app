'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import { ArrowLeftIcon, LockClosedIcon, LockOpenIcon } from '@heroicons/react/24/outline';

export default function NewCourseGroupPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    is_sequential: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      alert('タイトルを入力してください');
      return;
    }

    setSaving(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('認証セッションが見つかりません');
        return;
      }

      const response = await fetch('/api/course-groups', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'グループの作成に失敗しました');
      }

      const data = await response.json();
      alert('グループを作成しました');
      router.push(`/admin/course-groups/${data.group.id}/edit`);
    } catch (err: any) {
      console.error('作成エラー:', err);
      alert(err.message || 'グループの作成に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <Link href="/admin/course-groups">
              <button className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 mb-4">
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                グループ一覧に戻る
              </button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              新規コースグループ作成
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              複数のコースをグループ化して学習パスを作成します
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                基本情報
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    グループ名 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="例: 基礎プログラミングコース"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    説明
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="このグループの説明を入力してください"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100"
                    rows={4}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    アンロック方式
                  </label>
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, is_sequential: true })}
                      className={`w-full flex items-start p-4 rounded-lg border-2 transition-colors ${
                        formData.is_sequential
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <LockClosedIcon className={`h-6 w-6 mr-3 flex-shrink-0 ${
                        formData.is_sequential ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'
                      }`} />
                      <div className="text-left">
                        <div className={`font-medium mb-1 ${
                          formData.is_sequential
                            ? 'text-blue-900 dark:text-blue-300'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}>
                          順次アンロック（推奨）
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          前のコースを完了しないと次のコースが受講できません。段階的な学習に最適です。
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, is_sequential: false })}
                      className={`w-full flex items-start p-4 rounded-lg border-2 transition-colors ${
                        !formData.is_sequential
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <LockOpenIcon className={`h-6 w-6 mr-3 flex-shrink-0 ${
                        !formData.is_sequential ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'
                      }`} />
                      <div className="text-left">
                        <div className={`font-medium mb-1 ${
                          !formData.is_sequential
                            ? 'text-blue-900 dark:text-blue-300'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}>
                          自由受講
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          すべてのコースを自由に受講できます。復習や並行学習に適しています。
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Link href="/admin/course-groups">
                <Button type="button" variant="secondary">
                  キャンセル
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={saving || !formData.title.trim()}
              >
                {saving ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    作成中...
                  </>
                ) : (
                  '作成してコースを追加'
                )}
              </Button>
            </div>
          </form>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
