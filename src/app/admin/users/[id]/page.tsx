'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import {
  UserCircleIcon,
  ArrowLeftIcon,
  AcademicCapIcon,
  ClockIcon,
  TrophyIcon,
  CalendarIcon,
  EnvelopeIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  TrashIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import {
  CheckCircleIcon as CheckCircleIconSolid,
  XCircleIcon as XCircleIconSolid
} from '@heroicons/react/24/solid';

interface StudentDetail {
  id: string;
  display_name: string;
  email: string;
  company?: string;
  department?: string;
  role: string;
  is_active: boolean;
  last_login_at?: string;
  password_changed_at?: string;
  created_at: string;
  updated_at: string;
}

interface LearningProgress {
  id: string;
  course_id: string;
  course_title: string;
  video_id: string;
  video_title: string;
  progress: number;
  status: 'not_started' | 'in_progress' | 'completed';
  total_watched_time: number;
  start_time?: string;
  end_time?: string;
  last_updated: string;
}

interface CourseStats {
  totalAssigned: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  totalWatchTime: number;
  avgProgress: number;
}


export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [learningProgress, setLearningProgress] = useState<LearningProgress[]>([]);
  const [courseStats, setCourseStats] = useState<CourseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    display_name: '',
    company: '',
    department: '',
    is_active: true
  });

  const studentId = params.id as string;

  useEffect(() => {
    if (studentId && isAdmin) {
      fetchStudentDetail();
      fetchLearningProgress();
    }
  }, [studentId, isAdmin]);

  const fetchStudentDetail = async () => {
    try {
      setLoading(true);

      // ユーザーの基本情報を取得（user_profilesから全て取得）
      const { data: studentData, error: studentError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', studentId)
        .single();

      if (studentError) {
        console.error('学生情報取得エラー:', studentError);
        return;
      }

      // emailがない場合はauth.usersから取得して更新
      let finalStudentData = studentData;
      if (!studentData.email) {
        const { data: authData } = await supabase
          .from('auth.users')
          .select('email')
          .eq('id', studentId)
          .single();

        if (authData?.email) {
          // user_profilesのemailを更新
          await supabase
            .from('user_profiles')
            .update({ email: authData.email })
            .eq('id', studentId);

          finalStudentData = {
            ...studentData,
            email: authData.email
          };
        }
      }

      setStudent(finalStudentData);
      setEditForm({
        display_name: finalStudentData.display_name || '',
        company: finalStudentData.company || '',
        department: finalStudentData.department || '',
        is_active: finalStudentData.is_active ?? true
      });

    } catch (error) {
      console.error('学生詳細取得エラー:', error);
    }
  };

  const fetchLearningProgress = async () => {
    try {
      // まず割り当てられたコースを取得
      const { data: assignedCourses, error: assignError } = await supabase
        .from('user_course_assignments')
        .select('course_id')
        .eq('user_id', studentId);

      if (assignError) {
        console.error('コース割り当て取得エラー:', assignError);
      }

      const totalAssignedCourses = assignedCourses?.length || 0;

      // 学習進捗を取得
      const { data: progressData, error: progressError } = await supabase
        .from('video_view_logs')
        .select(`
          id,
          course_id,
          video_id,
          progress_percent,
          status,
          total_watched_time,
          start_time,
          end_time,
          last_updated,
          courses!inner(title),
          videos!inner(title)
        `)
        .eq('user_id', studentId)
        .order('last_updated', { ascending: false });

      if (progressError) {
        console.error('学習進捗取得エラー:', progressError);
        return;
      }

      const formattedProgress = (progressData || []).map((item: any) => ({
        id: item.id,
        course_id: item.course_id,
        course_title: item.courses.title,
        video_id: item.video_id,
        video_title: item.videos.title,
        progress: item.progress_percent || 0,
        status: item.status || 'not_started',
        total_watched_time: item.total_watched_time || 0,
        start_time: item.start_time,
        end_time: item.end_time,
        last_updated: item.last_updated
      }));

      setLearningProgress(formattedProgress);

      // 統計を計算（割り当てられたコース数を使用）
      const uniqueCourses = new Set(formattedProgress.map(p => p.course_id));
      const completedCourses = new Set(
        formattedProgress
          .filter(p => p.status === 'completed')
          .map(p => p.course_id)
      );

      const stats = {
        totalAssigned: totalAssignedCourses,
        completed: completedCourses.size,
        inProgress: uniqueCourses.size - completedCourses.size,
        notStarted: totalAssignedCourses - uniqueCourses.size,
        totalWatchTime: formattedProgress.reduce((sum, p) => sum + p.total_watched_time, 0),
        avgProgress: totalAssignedCourses > 0
          ? Math.round(formattedProgress.reduce((sum, p) => sum + p.progress, 0) / formattedProgress.length || 0)
          : 0
      };

      setCourseStats(stats);

    } catch (error) {
      console.error('学習進捗取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateCourseStats = (progress: LearningProgress[]): CourseStats => {
    const totalAssigned = progress.length;
    const completed = progress.filter(p => p.status === 'completed').length;
    const inProgress = progress.filter(p => p.status === 'in_progress').length;
    const notStarted = progress.filter(p => p.status === 'not_started').length;
    const totalWatchTime = progress.reduce((sum, p) => sum + p.total_watched_time, 0);
    const avgProgress = totalAssigned > 0 
      ? Math.round(progress.reduce((sum, p) => sum + p.progress, 0) / totalAssigned)
      : 0;

    return {
      totalAssigned,
      completed,
      inProgress,
      notStarted,
      totalWatchTime,
      avgProgress
    };
  };

  const handleSaveEdit = async () => {
    if (!student) return;

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          display_name: editForm.display_name,
          company: editForm.company,
          department: editForm.department,
          is_active: editForm.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', studentId);

      if (error) {
        console.error('更新エラー:', error);
        alert('更新に失敗しました');
        return;
      }

      await fetchStudentDetail();
      setEditMode(false);
      alert('更新しました');
    } catch (error) {
      console.error('更新エラー:', error);
      alert('更新に失敗しました');
    }
  };

  const handleResetProgress = async (progressId: string) => {
    if (!confirm('この動画の視聴履歴をリセットしてもよろしいですか？')) {
      return;
    }

    try {
      // 視聴履歴を削除（完全リセット）
      const { error } = await supabase
        .from('video_view_logs')
        .delete()
        .eq('id', progressId);

      if (error) {
        console.error('リセットエラー:', error);
        alert('リセットに失敗しました');
        return;
      }

      await fetchLearningProgress();
      alert('視聴履歴をリセットしました');
    } catch (error) {
      console.error('リセットエラー:', error);
      alert('リセットに失敗しました');
    }
  };

  const handleResetAllProgress = async () => {
    if (!confirm('この生徒の全ての視聴履歴をリセットしてもよろしいですか？\nこの操作は取り消せません。')) {
      return;
    }

    try {
      // 全ての視聴履歴を削除（完全リセット）
      const { error } = await supabase
        .from('video_view_logs')
        .delete()
        .eq('user_id', studentId);

      if (error) {
        console.error('リセットエラー:', error);
        alert('リセットに失敗しました');
        return;
      }

      await fetchLearningProgress();
      alert('全ての視聴履歴をリセットしました');
    } catch (error) {
      console.error('リセットエラー:', error);
      alert('リセットに失敗しました');
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'completed': { text: '完了', color: 'bg-green-100 text-green-800', icon: CheckCircleIconSolid },
      'in_progress': { text: '受講中', color: 'bg-blue-100 text-blue-800', icon: ClockIcon },
      'not_started': { text: '未開始', color: 'bg-gray-100 dark:bg-neutral-900 text-gray-800 dark:text-gray-200', icon: ExclamationTriangleIcon }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.not_started;
    const IconComponent = config.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <IconComponent className="h-3 w-3 mr-1" />
        {config.text}
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
            <UserCircleIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">学生が見つかりません</h2>
            <Link href="/admin/students">
              <Button>生徒管理に戻る</Button>
            </Link>
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
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Link href="/admin/students">
                  <button className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg mr-3">
                    <ArrowLeftIcon className="h-5 w-5" />
                  </button>
                </Link>
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mr-4">
                  <UserCircleIcon className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">生徒詳細</h1>
                  <p className="text-gray-600 dark:text-gray-400">{student.display_name}の学習状況と管理</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Basic Info */}
              <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">基本情報</h2>
                  {editMode ? (
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditMode(false);
                          setEditForm({
                            display_name: student.display_name || '',
                            company: student.company || '',
                            department: student.department || '',
                            is_active: student.is_active ?? true
                          });
                        }}
                      >
                        キャンセル
                      </Button>
                      <Button size="sm" onClick={handleSaveEdit}>
                        保存
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditMode(true)}
                      className="flex items-center"
                    >
                      <PencilIcon className="h-4 w-4 mr-2" />
                      編集
                    </Button>
                  )}
                </div>
                
                {editMode ? (
                  <div className="space-y-4">
                    <Input
                      label="表示名"
                      value={editForm.display_name}
                      onChange={(e) => setEditForm({...editForm, display_name: e.target.value})}
                      required
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="会社名"
                        value={editForm.company}
                        onChange={(e) => setEditForm({...editForm, company: e.target.value})}
                      />
                      <Input
                        label="部署名"
                        value={editForm.department}
                        onChange={(e) => setEditForm({...editForm, department: e.target.value})}
                      />
                    </div>
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        id="is_active"
                        checked={editForm.is_active}
                        onChange={(e) => setEditForm({...editForm, is_active: e.target.checked})}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                      />
                      <label htmlFor="is_active" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        アクティブ
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex items-center space-x-3">
                      <UserCircleIcon className="h-5 w-5 text-gray-400" />
                      <div>
                        <div className="text-sm font-medium text-gray-500 dark:text-gray-400">表示名</div>
                        <div className="text-gray-900 dark:text-white">{student.display_name}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                      <div>
                        <div className="text-sm font-medium text-gray-500 dark:text-gray-400">メールアドレス</div>
                        <div className="text-gray-900 dark:text-white">{student.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <BuildingOfficeIcon className="h-5 w-5 text-gray-400" />
                      <div>
                        <div className="text-sm font-medium text-gray-500 dark:text-gray-400">会社名</div>
                        <div className="text-gray-900 dark:text-white">{student.company || '-'}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <UserGroupIcon className="h-5 w-5 text-gray-400" />
                      <div>
                        <div className="text-sm font-medium text-gray-500 dark:text-gray-400">部署</div>
                        <div className="text-gray-900 dark:text-white">{student.department || '-'}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      {student.is_active ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircleIcon className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <div className="text-sm font-medium text-gray-500 dark:text-gray-400">ステータス</div>
                        <div className={`font-medium ${student.is_active ? 'text-green-600' : 'text-red-600'}`}>
                          {student.is_active ? 'アクティブ' : '非アクティブ'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <CalendarIcon className="h-5 w-5 text-gray-400" />
                      <div>
                        <div className="text-sm font-medium text-gray-500 dark:text-gray-400">最終ログイン</div>
                        <div className="text-gray-900 dark:text-white">
                          {student.last_login_at 
                            ? new Date(student.last_login_at).toLocaleString('ja-JP', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                              })
                            : '未ログイン'
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Learning Progress */}
              <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">学習進捗詳細</h2>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400">{learningProgress.length}件の学習記録</span>
                    {learningProgress.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleResetAllProgress}
                        className="text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <ArrowPathIcon className="h-4 w-4 mr-1" />
                        全てリセット
                      </Button>
                    )}
                  </div>
                </div>

                {learningProgress.length === 0 ? (
                  <div className="text-center py-8">
                    <AcademicCapIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">学習記録がありません</h3>
                    <p className="text-gray-600 dark:text-gray-400">この生徒はまだ学習を開始していません</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {learningProgress.map((progress) => (
                      <div key={progress.id} className="border border-gray-200 dark:border-neutral-800 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <h3 className="font-medium text-gray-900 dark:text-white">{progress.course_title}</h3>
                              {getStatusBadge(progress.status)}
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{progress.video_title}</p>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">進捗率:</span>
                                <span className="font-medium text-gray-900 dark:text-white ml-2">{progress.progress}%</span>
                              </div>
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">視聴時間:</span>
                                <span className="font-medium text-gray-900 dark:text-white ml-2">
                                  {formatTime(progress.total_watched_time)}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">最終更新:</span>
                                <span className="font-medium text-gray-900 dark:text-white ml-2">
                                  {new Date(progress.last_updated).toLocaleString('ja-JP')}
                                </span>
                              </div>
                            </div>

                            {progress.start_time && (
                              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                開始: {new Date(progress.start_time).toLocaleString('ja-JP')}
                                {progress.end_time && (
                                  <> / 終了: {new Date(progress.end_time).toLocaleString('ja-JP')}</>
                                )}
                              </div>
                            )}
                          </div>
                          
                          <div className="ml-4 flex items-center space-x-2">
                            <button
                              onClick={() => handleResetProgress(progress.id)}
                              className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="視聴履歴をリセット"
                            >
                              <ArrowPathIcon className="h-4 w-4" />
                            </button>
                            <div className="w-16 h-16 relative">
                              <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                                <path
                                  className="text-gray-200"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  fill="none"
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                />
                                <path
                                  className={`${
                                    progress.status === 'completed' ? 'text-green-500' :
                                    progress.status === 'in_progress' ? 'text-blue-500' : 'text-gray-300'
                                  }`}
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  fill="none"
                                  strokeDasharray={`${progress.progress}, 100`}
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                  {progress.progress}%
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-8">
              {/* Statistics */}
              <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">学習統計</h3>
                {courseStats && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">総割当数</span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{courseStats.totalAssigned}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">完了</span>
                      <span className="text-sm font-bold text-green-600">{courseStats.completed}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">受講中</span>
                      <span className="text-sm font-bold text-blue-600">{courseStats.inProgress}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">未開始</span>
                      <span className="text-sm font-bold text-gray-600 dark:text-gray-400">{courseStats.notStarted}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">総学習時間</span>
                      <span className="text-sm font-bold text-purple-600">
                        {formatTime(courseStats.totalWatchTime)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">平均進捗</span>
                      <span className="text-sm font-bold text-indigo-600">{courseStats.avgProgress}%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Account Info */}
              <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">アカウント情報</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">作成日:</span>
                    <div className="text-gray-600 dark:text-gray-400">
                      {new Date(student.created_at).toLocaleDateString('ja-JP')}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">更新日:</span>
                    <div className="text-gray-600 dark:text-gray-400">
                      {new Date(student.updated_at).toLocaleDateString('ja-JP')}
                    </div>
                  </div>
                  {student.password_changed_at && (
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">パスワード変更:</span>
                      <div className="text-gray-600 dark:text-gray-400">
                        {new Date(student.password_changed_at).toLocaleDateString('ja-JP')}
                      </div>
                    </div>
                  )}
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">ロール:</span>
                    <div className="text-gray-600 dark:text-gray-400 capitalize">{student.role}</div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">クイックアクション</h3>
                <div className="space-y-3">
                  <Link 
                    href={`/admin/users/${studentId}/courses`}
                    className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg hover:bg-indigo-100 transition-colors"
                  >
                    <AcademicCapIcon className="h-4 w-4 mr-2" />
                    コース管理
                  </Link>
                  <button className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-black rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <EnvelopeIcon className="h-4 w-4 mr-2" />
                    メッセージ送信
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}