'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import {
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  Bars3Icon,
  LockClosedIcon,
  LockOpenIcon,
  AcademicCapIcon
} from '@heroicons/react/24/outline';
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

type Course = {
  id: number;
  title: string;
  description: string | null;
  category: string | null;
  difficulty_level: string | null;
};

type GroupItem = {
  id: number;
  group_id: number;
  course_id: number;
  order_index: number;
  course: Course;
};

type CourseGroup = {
  id: number;
  title: string;
  description: string | null;
  is_sequential: boolean;
  items: GroupItem[];
};

function SortableItem({ id, children }: { id: number; children: React.ReactNode }) {
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
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children}
      <button
        {...listeners}
        className="absolute top-4 left-4 p-2 bg-white dark:bg-neutral-800 rounded-lg shadow hover:shadow-lg transition-shadow cursor-move"
        title="ドラッグして並び替え"
      >
        <Bars3Icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
      </button>
    </div>
  );
}

export default function EditCourseGroupPage() {
  const params = useParams();
  const router = useRouter();
  const groupId = parseInt(params.id as string);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [group, setGroup] = useState<CourseGroup | null>(null);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);

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
    if (groupId) {
      fetchGroup();
      fetchAllCourses();
    }
  }, [groupId]);

  const fetchGroup = async () => {
    try {
      setLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/course-groups/${groupId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('グループの取得に失敗しました');
      }

      const data = await response.json();
      setGroup(data.group);
    } catch (err) {
      console.error('グループ取得エラー:', err);
      alert('グループの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllCourses = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/courses?admin=true&status=all', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('コース一覧の取得に失敗しました');
      }

      const data = await response.json();
      setAllCourses(data.courses || []);
    } catch (err) {
      console.error('コース取得エラー:', err);
    }
  };

  const handleUpdateGroup = async () => {
    if (!group) return;

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/course-groups/${groupId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: group.title,
          description: group.description,
          is_sequential: group.is_sequential,
        }),
      });

      if (!response.ok) {
        throw new Error('グループの更新に失敗しました');
      }

      alert('グループを更新しました');
    } catch (err: any) {
      console.error('更新エラー:', err);
      alert(err.message || 'グループの更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCourse = async () => {
    if (!selectedCourseId) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/course-groups/${groupId}/items`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          course_id: selectedCourseId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'コースの追加に失敗しました');
      }

      await fetchGroup();
      setShowAddCourse(false);
      setSelectedCourseId(null);
      alert('コースを追加しました');
    } catch (err: any) {
      console.error('追加エラー:', err);
      alert(err.message || 'コースの追加に失敗しました');
    }
  };

  const handleRemoveCourse = async (itemId: number) => {
    if (!confirm('このコースをグループから削除しますか？')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/course-groups/${groupId}/items?item_id=${itemId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('コースの削除に失敗しました');
      }

      await fetchGroup();
      alert('コースを削除しました');
    } catch (err: any) {
      console.error('削除エラー:', err);
      alert(err.message || 'コースの削除に失敗しました');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id || !group) {
      return;
    }

    const oldIndex = group.items.findIndex((item) => item.id === active.id);
    const newIndex = group.items.findIndex((item) => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const newItems = arrayMove(group.items, oldIndex, newIndex).map((item, index) => ({
      ...item,
      order_index: index
    }));

    setGroup({ ...group, items: newItems });

    // サーバーに保存
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/course-groups/${groupId}/items`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: newItems.map(item => ({
            id: item.id,
            order_index: item.order_index
          }))
        }),
      });

      if (!response.ok) {
        throw new Error('順序の更新に失敗しました');
      }
    } catch (err) {
      console.error('順序更新エラー:', err);
      alert('順序の更新に失敗しました');
      fetchGroup(); // 元に戻す
    }
  };

  const availableCourses = allCourses.filter(
    course => !group?.items.some(item => item.course_id === course.id)
  );

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

  if (!group) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400">グループが見つかりません</p>
            <Link href="/admin/course-groups">
              <Button className="mt-4">グループ一覧に戻る</Button>
            </Link>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <Link href="/admin/course-groups">
              <button className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 mb-4">
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                グループ一覧に戻る
              </button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              グループ編集
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              グループの設定とコースの管理
            </p>
          </div>

          {/* Group Settings */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              基本設定
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  グループ名
                </label>
                <Input
                  type="text"
                  value={group.title}
                  onChange={(e) => setGroup({ ...group, title: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  説明
                </label>
                <textarea
                  value={group.description || ''}
                  onChange={(e) => setGroup({ ...group, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  アンロック方式
                </label>
                <div className="flex space-x-4">
                  <button
                    type="button"
                    onClick={() => setGroup({ ...group, is_sequential: true })}
                    className={`flex-1 flex items-center justify-center p-3 rounded-lg border-2 transition-colors ${
                      group.is_sequential
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    <LockClosedIcon className="h-5 w-5 mr-2" />
                    順次アンロック
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroup({ ...group, is_sequential: false })}
                    className={`flex-1 flex items-center justify-center p-3 rounded-lg border-2 transition-colors ${
                      !group.is_sequential
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    <LockOpenIcon className="h-5 w-5 mr-2" />
                    自由受講
                  </button>
                </div>
              </div>

              <div className="pt-4">
                <Button onClick={handleUpdateGroup} disabled={saving}>
                  {saving ? '保存中...' : '設定を保存'}
                </Button>
              </div>
            </div>
          </div>

          {/* Courses */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                コース ({group.items.length})
              </h2>
              <Button onClick={() => setShowAddCourse(true)}>
                <PlusIcon className="h-4 w-4 mr-2" />
                コースを追加
              </Button>
            </div>

            {group.items.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <AcademicCapIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>まだコースが追加されていません</p>
                <Button onClick={() => setShowAddCourse(true)} className="mt-4">
                  最初のコースを追加
                </Button>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={group.items.map(item => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {group.items.map((item, index) => (
                      <SortableItem key={item.id} id={item.id}>
                        <div className="relative pl-14 pr-14 py-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3 mb-1">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 text-sm font-medium">
                                  {index + 1}
                                </span>
                                <h3 className="font-medium text-gray-900 dark:text-white">
                                  {item.course.title}
                                </h3>
                              </div>
                              {item.course.description && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1 ml-9">
                                  {item.course.description}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => handleRemoveCourse(item.id)}
                              className="absolute top-4 right-4 p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="削除"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </SortableItem>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Add Course Modal */}
          {showAddCourse && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-neutral-900 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
                <div className="p-6 border-b border-gray-200 dark:border-neutral-800">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    コースを追加
                  </h3>
                </div>
                <div className="p-6 overflow-y-auto max-h-96">
                  {availableCourses.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                      追加できるコースがありません
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {availableCourses.map(course => (
                        <button
                          key={course.id}
                          onClick={() => setSelectedCourseId(course.id)}
                          className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                            selectedCourseId === course.id
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                        >
                          <div className="font-medium text-gray-900 dark:text-white mb-1">
                            {course.title}
                          </div>
                          {course.description && (
                            <div className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                              {course.description}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="p-6 border-t border-gray-200 dark:border-neutral-800 flex justify-end space-x-3">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShowAddCourse(false);
                      setSelectedCourseId(null);
                    }}
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleAddCourse}
                    disabled={!selectedCourseId}
                  >
                    追加
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
