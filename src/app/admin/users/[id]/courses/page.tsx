'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import {
  ArrowLeftIcon,
  AcademicCapIcon,
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  BookOpenIcon
} from '@heroicons/react/24/outline';
import {
  CheckCircleIcon as CheckCircleIconSolid
} from '@heroicons/react/24/solid';

interface Course {
  id: number;
  title: string;
  description: string;
  category: string;
  difficulty_level: string;
  estimated_duration: number;
  status: string;
}

interface AssignedCourse {
  id: number;
  course_id: number;
  course_title: string;
  assigned_at: string;
  assigned_by: string | null;
  due_date: string | null;
  status: string;
  progress: number;
  last_accessed?: string;
  videos_completed: number;
  total_videos: number;
  course_info: {
    title: string;
    description: string;
    category: string;
    difficulty_level: string;
    estimated_duration: number;
  };
}

interface StudentInfo {
  id: string;
  display_name: string;
  email: string;
  company?: string;
  department?: string;
}


export default function StudentCoursesPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [assignedCourses, setAssignedCourses] = useState<AssignedCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCourses, setSelectedCourses] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const studentId = params.id as string;

  useEffect(() => {
    if (studentId && isAdmin) {
      fetchData();
    }
  }, [studentId, isAdmin]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // 学生情報を取得
      const { data: studentData } = await supabase
        .from('user_profiles')
        .select('id, display_name, email, company, department')
        .eq('id', studentId)
        .single();

      if (studentData) {
        // authテーブルからメールアドレスを取得
        const { data: authData } = await supabase.auth.admin.getUserById(studentId);
        setStudent({
          ...studentData,
          email: authData?.user?.email || studentData.email || ''
        });
      }

      // 全コースを取得
      const { data: coursesData } = await supabase
        .from('courses')
        .select('*')
        .eq('status', 'active')
        .order('title');

      setAllCourses(coursesData || []);

      // 学生に割り当てられたコースを取得
      await fetchAssignedCourses();

    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignedCourses = async () => {
    try {
      const response = await fetch(`/api/admin/users/${studentId}/courses`);
      const data = await response.json();

      if (data.success) {
        setAssignedCourses(data.data || []);
      } else {
        console.error('Failed to fetch assigned courses:', data.error);
      }
    } catch (error) {
      console.error('割り当てコース取得エラー:', error);
    }
  };

  const handleAddCourses = async () => {
    if (selectedCourses.length === 0) {
      alert('コースを選択してください');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${studentId}/courses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          courseIds: selectedCourses,
          assignedBy: user?.id
        })
      });

      const data = await response.json();

      if (data.success) {
        await fetchAssignedCourses();
        setShowAddModal(false);
        setSelectedCourses([]);
        alert(`${data.assigned}件のコースを割り当てました`);
      } else {
        alert(data.error || 'コースの割り当てに失敗しました');
      }
    } catch (error) {
      console.error('コース割り当てエラー:', error);
      alert('コースの割り当てに失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCourse = async (courseId: number) => {
    if (!confirm('このコースの割り当てを解除しますか？')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${studentId}/courses`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ courseId })
      });

      const data = await response.json();

      if (data.success) {
        await fetchAssignedCourses();
        alert('コースの割り当てを解除しました');
      } else {
        alert(data.error || 'コースの解除に失敗しました');
      }
    } catch (error) {
      console.error('コース解除エラー:', error);
      alert('コースの解除に失敗しました');
    }
  };

  const getStatusBadge = (status: string, progress: number) => {
    let displayStatus = 'not_started';
    if (progress >= 90) {
      displayStatus = 'completed';
    } else if (progress > 0) {
      displayStatus = 'in_progress';
    }

    const statusConfig = {
      'completed': { text: '完了', color: 'bg-green-100 text-green-800', icon: CheckCircleIconSolid },
      'in_progress': { text: '受講中', color: 'bg-blue-100 text-blue-800', icon: ClockIcon },
      'not_started': { text: '未開始', color: 'bg-gray-100 dark:bg-neutral-900 text-gray-800 dark:text-gray-200', icon: ExclamationTriangleIcon }
    };

    const config = statusConfig[displayStatus as keyof typeof statusConfig] || statusConfig.not_started;
    const IconComponent = config.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <IconComponent className="h-3 w-3 mr-1" />
        {config.text}
      </span>
    );
  };

  const getDifficultyBadge = (level: string) => {
    const config = {
      'beginner': { text: '初級', color: 'bg-green-100 text-green-800' },
      'intermediate': { text: '中級', color: 'bg-yellow-100 text-yellow-800' },
      'advanced': { text: '上級', color: 'bg-red-100 text-red-800' }
    };

    const levelConfig = config[level as keyof typeof config] || config.beginner;
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${levelConfig.color}`}>
        {levelConfig.text}
      </span>
    );
  };

  if (!isAdmin) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="text-center py-12">
            <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">アクセス権限がありません</h2>
            <Link href="/dashboard">
              <Button>ダッシュボードに戻る</Button>
            </Link>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

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

  if (!student) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">学生が見つかりません</h2>
            <Link href="/admin/students">
              <Button>生徒管理に戻る</Button>
            </Link>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  // 未割り当てのコース
  const availableCourses = allCourses.filter(
    course => !assignedCourses.some(ac => ac.course_id === course.id)
  );

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Link href={`/admin/users/${studentId}`}>
                  <button className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg mr-3">
                    <ArrowLeftIcon className="h-5 w-5" />
                  </button>
                </Link>
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mr-4">
                  <AcademicCapIcon className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">コース管理</h1>
                  <p className="text-gray-600 dark:text-gray-400">{student.display_name}のコース割り当て</p>
                </div>
              </div>
              <Button 
                onClick={() => setShowAddModal(true)}
                className="flex items-center"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                コースを追加
              </Button>
            </div>
          </div>

          {/* Student Info */}
          <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-4 mb-6">
            <div className="flex items-center space-x-6">
              <div>
                <span className="text-sm text-gray-500 dark:text-gray-400">生徒名:</span>
                <span className="ml-2 font-medium">{student.display_name}</span>
              </div>
              <div>
                <span className="text-sm text-gray-500 dark:text-gray-400">メール:</span>
                <span className="ml-2 font-medium">{student.email}</span>
              </div>
              {student.company && (
                <div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">会社:</span>
                  <span className="ml-2 font-medium">{student.company}</span>
                </div>
              )}
              <div>
                <span className="text-sm text-gray-500 dark:text-gray-400">割当コース数:</span>
                <span className="ml-2 font-medium text-indigo-600">{assignedCourses.length}件</span>
              </div>
            </div>
          </div>

          {/* Assigned Courses */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800">
            <div className="p-6 border-b border-gray-200 dark:border-neutral-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">割り当て済みコース</h2>
            </div>
            
            {assignedCourses.length === 0 ? (
              <div className="p-12 text-center">
                <BookOpenIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">コースが割り当てられていません</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">上のボタンからコースを追加してください</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {assignedCourses.map((course) => (
                  <div key={course.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-medium text-gray-900 dark:text-white">{course.course_title}</h3>
                          {getStatusBadge(course.status, course.progress)}
                          {course.course_info?.difficulty_level && getDifficultyBadge(course.course_info.difficulty_level)}
                        </div>
                        
                        {course.course_info?.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{course.course_info.description}</p>
                        )}
                        
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm mt-3">
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">進捗率:</span>
                            <span className="font-medium text-gray-900 dark:text-white ml-2">{course.progress}%</span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">動画完了:</span>
                            <span className="font-medium text-gray-900 dark:text-white ml-2">
                              {course.videos_completed} / {course.total_videos}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">割当日:</span>
                            <span className="font-medium text-gray-900 dark:text-white ml-2">
                              {new Date(course.assigned_at).toLocaleDateString('ja-JP')}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">最終アクセス:</span>
                            <span className="font-medium text-gray-900 dark:text-white ml-2">
                              {course.last_accessed 
                                ? new Date(course.last_accessed).toLocaleDateString('ja-JP')
                                : '未アクセス'
                              }
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-3">
                          <div className="bg-gray-200 rounded-full h-2">
                            <div 
                              className={`rounded-full h-2 transition-all duration-300 ${
                                course.progress >= 90 ? 'bg-green-50 dark:bg-green-900/200' :
                                course.progress > 0 ? 'bg-blue-50 dark:bg-blue-900/200' : 'bg-gray-300'
                              }`}
                              style={{ width: `${course.progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleRemoveCourse(course.course_id)}
                        className="ml-4 p-2 text-red-600 hover:text-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Course Modal */}
          {showAddModal && (
            <div className="fixed inset-0 bg-gray-50 dark:bg-black0 bg-opacity-75 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-neutral-900 rounded-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
                <div className="p-6 border-b border-gray-200 dark:border-neutral-800">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">コースを追加</h2>
                    <button
                      onClick={() => {
                        setShowAddModal(false);
                        setSelectedCourses([]);
                      }}
                      className="text-gray-400 hover:text-gray-600 dark:text-gray-400"
                    >
                      <XCircleIcon className="h-6 w-6" />
                    </button>
                  </div>
                </div>
                
                <div className="p-6 overflow-y-auto max-h-[60vh]">
                  {availableCourses.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-600 dark:text-gray-400">追加可能なコースがありません</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {availableCourses.map((course) => (
                        <div 
                          key={course.id}
                          className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                            selectedCourses.includes(course.id)
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                              : 'border-gray-200 dark:border-neutral-800 hover:border-gray-300 dark:border-gray-600'
                          }`}
                          onClick={() => {
                            setSelectedCourses(prev =>
                              prev.includes(course.id)
                                ? prev.filter(id => id !== course.id)
                                : [...prev, course.id]
                            );
                          }}
                        >
                          <div className="flex items-start">
                            <input
                              type="checkbox"
                              checked={selectedCourses.includes(course.id)}
                              onChange={() => {}}
                              className="mt-1 h-4 w-4 text-indigo-600 rounded"
                            />
                            <div className="ml-3 flex-1">
                              <div className="flex items-center space-x-3">
                                <h3 className="font-medium text-gray-900 dark:text-white">{course.title}</h3>
                                {getDifficultyBadge(course.difficulty_level)}
                                <span className="text-sm text-gray-500 dark:text-gray-400">{course.category}</span>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{course.description}</p>
                              {course.estimated_duration && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  推定時間: {course.estimated_duration}分
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="p-6 border-t border-gray-200 dark:border-neutral-800 flex justify-end space-x-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAddModal(false);
                      setSelectedCourses([]);
                    }}
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleAddCourses}
                    disabled={selectedCourses.length === 0 || saving}
                    loading={saving}
                  >
                    {saving ? '追加中...' : `${selectedCourses.length}件のコースを追加`}
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