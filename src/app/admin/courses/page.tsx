'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import { courseCache } from '@/utils/performance';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  PlayIcon,
  UsersIcon,
  ClockIcon,
  AcademicCapIcon,
  FunnelIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import type { Tables } from '@/lib/database/supabase';

type Course = Tables<'courses'> & {
  videos?: Array<Tables<'videos'>>;
  video_count?: number;
  total_duration?: number;
  enrollment_count?: number;
};

// Helper functions
const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}時間${minutes}分`;
  }
  return `${minutes}分`;
};

const difficultyLabels: Record<string, string> = {
  beginner: '初級',
  intermediate: '中級',
  advanced: '上級',
};

const categoryLabels: Record<string, string> = {
  programming: 'プログラミング',
  design: 'デザイン',
  business: 'ビジネス',
  marketing: 'マーケティング',
  other: 'その他',
};

export default function CoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      setLoading(true);

      // キャッシュをチェック
      const cacheKey = 'admin-courses';
      const cachedData = courseCache.get(cacheKey);

      if (cachedData) {
        const sortedData = (cachedData as Course[]).sort((a, b) =>
          (a.order_index || 0) - (b.order_index || 0)
        );
        setCourses(sortedData);
        setLoading(false);
        return;
      }

      // Supabaseセッションを取得
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('認証セッションが見つかりません');
      }

      // APIエンドポイント経由でコースを取得（管理者モード）
      const response = await fetch('/api/courses?admin=true&status=all', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'コース取得に失敗しました');
      }

      const data = await response.json();
      const processedCourses = data.courses;

      // order_indexでソート
      const sortedCourses = (processedCourses as Course[]).sort((a, b) =>
        (a.order_index || 0) - (b.order_index || 0)
      );

      // キャッシュに保存
      courseCache.set(cacheKey, sortedCourses);
      setCourses(sortedCourses);
    } catch (error) {
      console.error('コース取得エラー:', error);
      alert('コースの取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (courseId: number) => {
    if (!confirm('このコースを削除してもよろしいですか？')) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('認証セッションが見つかりません');
      }

      const response = await fetch(`/api/courses/${courseId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'コース削除に失敗しました');
      }

      alert('コースを削除しました');
      // キャッシュをクリア
      courseCache.clear();
      await fetchCourses();
    } catch (error) {
      console.error('コース削除エラー:', error);
      alert('コースの削除に失敗しました。');
    }
  };

  // フィルター処理
  const filteredCourses = courses.filter((course) => {
    const matchesSearch = course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || course.category === selectedCategory;
    const matchesStatus = selectedStatus === 'all' || course.status === selectedStatus;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // ユニークなカテゴリを取得
  const categories = Array.from(new Set(courses.map(c => c.category).filter(Boolean)));

  return (
    <AuthGuard requireAdmin>
      <MainLayout>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          {/* ヘッダー */}
          <div className="bg-white dark:bg-gray-800 shadow">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center">
                    <AcademicCapIcon className="h-8 w-8 mr-3 text-blue-600" />
                    コース管理
                  </h1>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    コースの作成・編集・管理を行います
                  </p>
                </div>
                <Link href="/admin/courses/new">
                  <Button className="flex items-center">
                    <PlusIcon className="h-5 w-5 mr-2" />
                    新規コース作成
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* 統計サマリー */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <AcademicCapIcon className="h-8 w-8 text-blue-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">総コース数</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{courses.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <CheckCircleIcon className="h-8 w-8 text-green-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">公開中</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {courses.filter(c => c.status === 'active').length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <XCircleIcon className="h-8 w-8 text-gray-400" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">非公開</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {courses.filter(c => c.status === 'inactive').length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <PlayIcon className="h-8 w-8 text-purple-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">総動画数</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {courses.reduce((sum, c) => sum + (c.video_count || 0), 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 検索・フィルター */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
              <div className="p-6">
                <div className="flex flex-col md:flex-row gap-4">
                  {/* 検索 */}
                  <div className="flex-1 relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="コース名・説明で検索..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  {/* フィルター表示切替 */}
                  <Button
                    variant="outline"
                    onClick={() => setShowFilters(!showFilters)}
                    className="flex items-center"
                  >
                    <FunnelIcon className="h-5 w-5 mr-2" />
                    フィルター
                    <ChevronDownIcon className={`h-4 w-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                  </Button>
                </div>

                {/* フィルターオプション */}
                {showFilters && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        カテゴリ
                      </label>
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      >
                        <option value="all">すべて</option>
                        {categories.map(cat => (
                          <option key={cat} value={cat}>
                            {categoryLabels[cat as string] || cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        ステータス
                      </label>
                      <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      >
                        <option value="all">すべて</option>
                        <option value="active">公開中</option>
                        <option value="inactive">非公開</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* コース一覧 */}
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            ) : filteredCourses.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                <AcademicCapIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  コースが見つかりません
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  検索条件を変更するか、新しいコースを作成してください
                </p>
                <Link href="/admin/courses/new">
                  <Button>
                    <PlusIcon className="h-5 w-5 mr-2" />
                    新規コース作成
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCourses.map((course) => (
                  <div
                    key={course.id}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden"
                  >
                    {/* サムネイル */}
                    <div className="relative h-48 bg-gradient-to-br from-blue-500 to-purple-600">
                      {course.thumbnail_url ? (
                        <img
                          src={course.thumbnail_url}
                          alt={course.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <AcademicCapIcon className="h-16 w-16 text-white opacity-50" />
                        </div>
                      )}
                      {/* ステータスバッジ */}
                      <div className="absolute top-4 right-4">
                        {course.status === 'active' ? (
                          <span className="px-3 py-1 bg-green-500 text-white text-xs font-medium rounded-full">
                            公開中
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-gray-500 text-white text-xs font-medium rounded-full">
                            非公開
                          </span>
                        )}
                      </div>
                    </div>

                    {/* コンテンツ */}
                    <div className="p-6">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 line-clamp-2">
                        {course.title}
                      </h3>

                      <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">
                        {course.description || 'コースの説明はありません'}
                      </p>

                      {/* メタ情報 */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        {course.category && (
                          <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded">
                            {categoryLabels[course.category] || course.category}
                          </span>
                        )}
                        {course.difficulty_level && (
                          <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-xs rounded">
                            {difficultyLabels[course.difficulty_level] || course.difficulty_level}
                          </span>
                        )}
                      </div>

                      {/* 統計情報 */}
                      <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                          <PlayIcon className="h-4 w-4 mr-2" />
                          {course.video_count || 0}本
                        </div>
                        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                          <ClockIcon className="h-4 w-4 mr-2" />
                          {course.total_duration ? formatDuration(course.total_duration) : '0分'}
                        </div>
                        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 col-span-2">
                          <UsersIcon className="h-4 w-4 mr-2" />
                          {course.enrollment_count || 0}人が受講中
                        </div>
                      </div>

                      {/* アクション */}
                      <div className="flex gap-2">
                        <Link href={`/admin/courses/${course.id}/videos`} className="flex-1">
                          <Button variant="outline" size="sm" className="w-full">
                            <PlayIcon className="h-4 w-4 mr-2" />
                            動画管理
                          </Button>
                        </Link>
                        <Link href={`/admin/courses/${course.id}/edit`}>
                          <Button variant="outline" size="sm">
                            <PencilIcon className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(course.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
