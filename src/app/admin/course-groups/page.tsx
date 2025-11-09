'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import {
  PlusIcon,
  FolderIcon,
  PencilIcon,
  TrashIcon,
  LockClosedIcon,
  LockOpenIcon,
  AcademicCapIcon
} from '@heroicons/react/24/outline';

type CourseGroup = {
  id: number;
  title: string;
  description: string | null;
  is_sequential: boolean;
  created_at: string;
  items?: any[];
};

export default function CourseGroupsPage() {
  const [groups, setGroups] = useState<CourseGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('認証セッションが見つかりません');
        return;
      }

      const response = await fetch('/api/course-groups?include_items=true', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'グループの取得に失敗しました');
      }

      const data = await response.json();
      setGroups(data.groups || []);
    } catch (err: any) {
      console.error('グループ取得エラー:', err);
      setError(err.message || 'グループの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (groupId: number) => {
    if (!confirm('このグループを削除してもよろしいですか？グループ内のコースは削除されません。')) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('認証セッションが見つかりません');
        return;
      }

      const response = await fetch(`/api/course-groups/${groupId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'グループの削除に失敗しました');
      }

      setGroups(groups.filter(g => g.id !== groupId));
      alert('グループを削除しました');
    } catch (err: any) {
      console.error('削除エラー:', err);
      alert(err.message || 'グループの削除に失敗しました');
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="flex justify-center items-center min-h-64">
            <LoadingSpinner size="lg" />
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  コースグループ管理
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  複数のコースをグループ化して、学習パスを作成・管理します
                </p>
              </div>
              <Link href="/admin/course-groups/new">
                <Button className="bg-blue-600 hover:bg-blue-700 flex items-center">
                  <PlusIcon className="h-4 w-4 mr-2" />
                  新規グループ作成
                </Button>
              </Link>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                <p className="text-red-800 dark:text-red-400">{error}</p>
              </div>
            )}

            {!error && groups.length === 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                <p className="text-blue-800 dark:text-blue-400 mb-4">
                  まだグループが作成されていません。最初のグループを作成してみましょう。
                </p>
                <Link href="/admin/course-groups/new">
                  <Button>
                    <PlusIcon className="h-4 w-4 mr-2" />
                    新規グループ作成
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Groups Grid */}
          {groups.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 overflow-hidden hover:shadow-lg dark:hover:shadow-gray-900/50 transition-shadow"
                >
                  {/* Header */}
                  <div className="bg-gradient-to-br from-purple-500 to-indigo-600 p-6">
                    <div className="flex items-start justify-between">
                      <FolderIcon className="h-8 w-8 text-white opacity-80" />
                      <div className="flex items-center space-x-1">
                        {group.is_sequential ? (
                          <div className="flex items-center px-2 py-1 bg-white/20 rounded-full text-xs text-white">
                            <LockClosedIcon className="h-3 w-3 mr-1" />
                            順次アンロック
                          </div>
                        ) : (
                          <div className="flex items-center px-2 py-1 bg-white/20 rounded-full text-xs text-white">
                            <LockOpenIcon className="h-3 w-3 mr-1" />
                            自由
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {group.title}
                    </h3>
                    {group.description && (
                      <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">
                        {group.description}
                      </p>
                    )}

                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-4">
                      <AcademicCapIcon className="h-4 w-4 mr-1" />
                      {group.items?.length || 0} コース
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-neutral-800">
                      <Link href={`/admin/course-groups/${group.id}/edit`}>
                        <button className="flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium">
                          <PencilIcon className="h-4 w-4 mr-1" />
                          編集
                        </button>
                      </Link>
                      <button
                        onClick={() => handleDelete(group.id)}
                        className="flex items-center text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm font-medium"
                      >
                        <TrashIcon className="h-4 w-4 mr-1" />
                        削除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
