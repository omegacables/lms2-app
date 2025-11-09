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
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  Bars3Icon
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

const getDifficultyBadgeColor = (level: string) => {
  switch (level) {
    case 'beginner':
      return 'bg-green-100 text-green-800';
    case 'intermediate':
      return 'bg-yellow-100 text-yellow-800';
    case 'advanced':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 dark:bg-neutral-900 text-gray-800 dark:text-gray-200';
  }
};

const getDifficultyLabel = (level: string) => {
  switch (level) {
    case 'beginner':
      return '初級';
    case 'intermediate':
      return '中級';
    case 'advanced':
      return '上級';
    default:
      return level;
  }
};

// Course Card Component
function CourseCard({
  course,
  onDelete,
  onToggleStatus,
  isDisabled = false
}: {
  course: Course;
  onDelete: (id: number) => void;
  onToggleStatus: (id: number, status: string) => void;
  isDisabled?: boolean;
}) {
  return (
    <div
      className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 overflow-hidden hover:shadow-lg dark:hover:shadow-gray-900/50 transition-shadow cursor-pointer"
      onClick={() => !isDisabled && (window.location.href = `/admin/courses/${course.id}/edit`)}
    >
      {/* Course Image/Icon */}
      <div className="h-48 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center relative overflow-hidden">
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt={course.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <AcademicCapIcon className="h-16 w-16 text-white opacity-80" />
        )}

        {/* Status Badge */}
        <div className="absolute top-4 right-4">
          {course.status === 'active' ? (
            <div className="flex items-center px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
              <CheckCircleIcon className="h-3 w-3 mr-1" />
              公開中
            </div>
          ) : (
            <div className="flex items-center px-2 py-1 bg-gray-100 dark:bg-neutral-900 text-gray-800 dark:text-gray-200 rounded-full text-xs font-medium">
              <XCircleIcon className="h-3 w-3 mr-1" />
              非公開
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Title and Category */}
        <div className="mb-3">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white line-clamp-2">
              {course.title}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            {course.category && (
              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                {course.category}
              </span>
            )}
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyBadgeColor(course.difficulty_level || '')}`}>
              {getDifficultyLabel(course.difficulty_level || '')}
            </span>
          </div>

          <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-2">
            {course.description || '説明なし'}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4 text-center">
          <div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white">
              {course.video_count || 0}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">動画</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white">
              {course.total_duration ? formatDuration(course.total_duration) : '0分'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">総時間</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <div className="flex space-x-2">
            <Link href={`/courses/${course.id}`}>
              <button
                onClick={(e) => e.stopPropagation()}
                className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                title="詳細表示（生徒ビュー）"
                disabled={isDisabled}
              >
                <EyeIcon className="h-4 w-4" />
              </button>
            </Link>
            <Link href={`/admin/courses/${course.id}/edit`}>
              <button
                onClick={(e) => e.stopPropagation()}
                className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="編集"
                disabled={isDisabled}
              >
                <PencilIcon className="h-4 w-4" />
              </button>
            </Link>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(course.id);
              }}
              className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title="削除"
              disabled={isDisabled}
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleStatus(course.id, course.status || 'inactive');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              course.status === 'active'
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
            disabled={isDisabled}
          >
            {course.status === 'active' ? '非公開にする' : '公開する'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Sortable Item Component
function SortableItem({ id, children }: { id: string | number; children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className={`relative ${isDragging ? 'ring-2 ring-blue-500 ring-opacity-50 rounded-xl' : ''}`}>
        <div
          {...attributes}
          {...listeners}
          className="absolute top-4 left-4 z-10 cursor-move p-2 bg-white dark:bg-neutral-800 rounded-lg shadow-md hover:shadow-xl hover:scale-110 transition-all duration-200"
          title="ドラッグして並び替え"
        >
          <Bars3Icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        </div>
        {children}
      </div>
    </div>
  );
}

export default function CoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [isSorting, setIsSorting] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

      // APIエンドポイント経由でコースを取得（管理者モード）
      const response = await fetch('/api/courses?admin=true&status=all', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('コース取得に失敗しました');
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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = courses.findIndex((c) => c.id === active.id);
    const newIndex = courses.findIndex((c) => c.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      console.error('Invalid drag indices:', { oldIndex, newIndex });
      return;
    }

    const newCourses = arrayMove(courses, oldIndex, newIndex);

    // order_indexを更新（0から始まる連番）
    const updatedCourses = newCourses.map((course, index) => ({
      ...course,
      order_index: index
    }));

    // 即座にUIを更新
    setCourses(updatedCourses);

    // サーバーに保存
    await saveCoursesOrder(updatedCourses);
  };

  const saveCoursesOrder = async (orderedCourses: Course[]) => {
    setSavingOrder(true);
    try {
      const coursesToUpdate = orderedCourses.map((course, index) => ({
        id: course.id,
        order_index: index
      }));

      // Supabaseセッションを取得してトークンを含める
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('認証セッションが見つかりません');
      }

      const response = await fetch('/api/courses/reorder', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        credentials: 'include',
        body: JSON.stringify({ courses: coursesToUpdate }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server error:', errorData);
        throw new Error(errorData.error || 'Failed to update course order');
      }

      // キャッシュをクリア
      courseCache.clear();
    } catch (error) {
      console.error('Error saving course order:', error);
      alert('コースの並び順の保存に失敗しました');
      // エラー時は元に戻す
      fetchCourses();
    } finally {
      setSavingOrder(false);
    }
  };

  const filteredCourses = courses.filter(course => {
    const matchesSearch = course.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         course.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || course.category === selectedCategory;
    const matchesStatus = selectedStatus === 'all' || course.status === selectedStatus;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const categories = [...new Set(courses.map(course => course.category).filter(Boolean))];

  const handleDeleteCourse = async (courseId: number) => {
    if (!confirm('このコースを削除してもよろしいですか？')) return;

    try {
      const { error } = await supabase
        .from('courses')
        .delete()
        .eq('id', courseId);

      if (error) throw error;

      setCourses(courses.filter(course => course.id !== courseId));
      // キャッシュをクリア
      courseCache.clear();
    } catch (error) {
      console.error('コース削除エラー:', error);
      alert('コースの削除に失敗しました。');
    }
  };

  const toggleCourseStatus = async (courseId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    
    try {
      const { error } = await supabase
        .from('courses')
        .update({ status: newStatus })
        .eq('id', courseId);

      if (error) throw error;

      setCourses(courses.map(course => 
        course.id === courseId ? { ...course, status: newStatus } : course
      ));
      // キャッシュをクリア
      courseCache.clear();
    } catch (error) {
      console.error('コース状態更新エラー:', error);
      alert('コース状態の更新に失敗しました。');
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
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">コース管理</h1>
                <p className="text-gray-600 dark:text-gray-400">
                  コースの作成・編集・管理を行います（{filteredCourses.length}件）
                </p>
                {savingOrder && (
                  <div className="mt-2 inline-flex items-center px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium animate-pulse">
                    <LoadingSpinner size="sm" className="mr-2" />
                    並び順を保存中...
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setIsSorting(!isSorting)}
                  className={isSorting ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'}
                >
                  <Bars3Icon className="h-4 w-4 mr-2" />
                  {isSorting ? '並び替え完了' : '並び替え'}
                </Button>
                <Link href="/admin/courses/new">
                  <Button className="bg-blue-600 hover:bg-blue-700 flex items-center">
                    <PlusIcon className="h-4 w-4 mr-2" />
                    新規コース作成
                  </Button>
                </Link>
              </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-4">
              <div className="flex flex-col lg:flex-row gap-4">
                {/* Search */}
                <div className="flex-1">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="コース名・説明で検索..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                {/* Filter Toggle */}
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 lg:hidden"
                >
                  <FunnelIcon className="h-4 w-4 mr-2" />
                  フィルター
                  <ChevronDownIcon className={`h-4 w-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </button>

                {/* Desktop Filters */}
                <div className="hidden lg:flex items-center space-x-4">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">すべてのカテゴリ</option>
                    {categories.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>

                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">すべてのステータス</option>
                    <option value="active">公開中</option>
                    <option value="inactive">非公開</option>
                  </select>
                </div>
              </div>

              {/* Mobile Filters */}
              {showFilters && (
                <div className="lg:hidden mt-4 pt-4 border-t border-gray-200 dark:border-neutral-800">
                  <div className="grid grid-cols-2 gap-4">
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="all">すべてのカテゴリ</option>
                      {categories.map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>

                    <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="all">すべてのステータス</option>
                      <option value="active">公開中</option>
                      <option value="inactive">非公開</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Course Grid */}
          {filteredCourses.length === 0 ? (
            <div className="text-center py-12">
              <AcademicCapIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">コースが見つかりません</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {searchTerm || selectedCategory !== 'all' || selectedStatus !== 'all' 
                  ? '検索条件を変更してもう一度お試しください。' 
                  : '最初のコースを作成してみましょう。'}
              </p>
              <Link href="/admin/courses/new">
                <Button>
                  <PlusIcon className="h-4 w-4 mr-2" />
                  新規コース作成
                </Button>
              </Link>
            </div>
          ) : isSorting ? (
            // Sorting mode with drag and drop
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={filteredCourses.map(c => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredCourses.map((course) => (
                    <SortableItem key={course.id} id={course.id}>
                      <CourseCard
                        course={course}
                        onDelete={handleDeleteCourse}
                        onToggleStatus={toggleCourseStatus}
                        isDisabled={true}
                      />
                    </SortableItem>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            // Normal mode without drag and drop
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCourses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  onDelete={handleDeleteCourse}
                  onToggleStatus={toggleCourseStatus}
                  isDisabled={false}
                />
              ))}
            </div>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}