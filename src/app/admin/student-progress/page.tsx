'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  AcademicCapIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
  PlayCircleIcon,
  UserIcon,
  BuildingOfficeIcon,
  EnvelopeIcon,
  ArrowsUpDownIcon
} from '@heroicons/react/24/outline';

interface StudentProgress {
  id: string;
  display_name: string;
  email: string;
  company: string;
  department: string;
  assignedCourses: CourseProgress[];
  totalCourses: number;
  completedCourses: number;
  inProgressCourses: number;
  notStartedCourses: number;
  overallProgress: number;
}

interface CourseProgress {
  courseId: number;
  courseTitle: string;
  totalVideos: number;
  completedVideos: number;
  progress: number;
  status: 'completed' | 'in_progress' | 'not_started';
}

export default function StudentProgressPage() {
  const [students, setStudents] = useState<StudentProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'company' | 'progress'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [companies, setCompanies] = useState<string[]>([]);

  useEffect(() => {
    fetchStudentProgress();
  }, []);

  const fetchStudentProgress = async () => {
    try {
      setLoading(true);

      // 生徒（studentロール）のみを取得
      const { data: studentsData, error: studentsError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('role', 'student')
        .eq('is_active', true)
        .order('display_name', { ascending: true });

      if (studentsError) throw studentsError;

      // 会社一覧を取得
      const uniqueCompanies = Array.from(
        new Set(studentsData?.map(s => s.company).filter(Boolean))
      ).sort();
      setCompanies(uniqueCompanies);

      // 各生徒の進捗を計算
      const studentProgressData = await Promise.all(
        (studentsData || []).map(async (student) => {
          // 生徒に割り当てられたコースを取得
          const { data: assignmentsData } = await supabase
            .from('user_course_assignments')
            .select('course_id')
            .eq('user_id', student.id);

          const assignedCourseIds = assignmentsData?.map(a => a.course_id) || [];

          if (assignedCourseIds.length === 0) {
            return {
              id: student.id,
              display_name: student.display_name,
              email: student.email,
              company: student.company || '未設定',
              department: student.department || '未設定',
              assignedCourses: [],
              totalCourses: 0,
              completedCourses: 0,
              inProgressCourses: 0,
              notStartedCourses: 0,
              overallProgress: 0
            };
          }

          // 各コースの進捗を取得
          const courseProgressList: CourseProgress[] = await Promise.all(
            assignedCourseIds.map(async (courseId) => {
              try {
                // コース情報を取得
                const { data: courseData, error: courseError } = await supabase
                  .from('courses')
                  .select('id, title')
                  .eq('id', courseId)
                  .single();

                if (courseError || !courseData) {
                  console.error(`コース取得エラー (ID: ${courseId}):`, courseError);
                  return null;
                }

                // コースの動画一覧を取得
                const { data: videosData, error: videosError } = await supabase
                  .from('videos')
                  .select('id')
                  .eq('course_id', courseId)
                  .eq('status', 'active');

                if (videosError) {
                  console.error(`動画一覧取得エラー (コースID: ${courseId}):`, videosError);
                  return null;
                }

                const totalVideos = videosData?.length || 0;

                if (totalVideos === 0 || !videosData) {
                  return {
                    courseId,
                    courseTitle: courseData.title,
                    totalVideos: 0,
                    completedVideos: 0,
                    progress: 0,
                    status: 'not_started' as const
                  };
                }

                // 動画IDの配列を準備
                const videoIds = videosData.map(v => v.id);

                // 生徒の視聴ログを取得
                const { data: logsData, error: logsError } = await supabase
                  .from('video_view_logs')
                  .select('video_id, status, progress')
                  .eq('user_id', student.id)
                  .in('video_id', videoIds);

                if (logsError) {
                  console.error(`視聴ログ取得エラー (生徒ID: ${student.id}, コースID: ${courseId}):`, logsError);
                }

                const completedVideos = logsData?.filter(log => log.status === 'completed').length || 0;
                const watchedVideos = logsData?.filter(log => log.progress > 0).length || 0;
                const progress = totalVideos > 0 ? (completedVideos / totalVideos) * 100 : 0;

                let status: 'completed' | 'in_progress' | 'not_started' = 'not_started';
                if (completedVideos === totalVideos && totalVideos > 0) {
                  status = 'completed';
                } else if (watchedVideos > 0) {
                  status = 'in_progress';
                }

                return {
                  courseId,
                  courseTitle: courseData.title,
                  totalVideos,
                  completedVideos,
                  progress,
                  status
                };
              } catch (error) {
                console.error(`コース ${courseId} の処理エラー:`, error);
                return null;
              }
            })
          );

          const validCourses = courseProgressList.filter(c => c !== null) as CourseProgress[];

          // コース単位での統計を計算
          const completedCourses = validCourses.filter(c => c.status === 'completed').length;
          const inProgressCourses = validCourses.filter(c => c.status === 'in_progress').length;
          const notStartedCourses = validCourses.filter(c => c.status === 'not_started').length;

          // 全体の進捗率（全コースの平均）
          const overallProgress = validCourses.length > 0
            ? validCourses.reduce((sum, c) => sum + c.progress, 0) / validCourses.length
            : 0;

          return {
            id: student.id,
            display_name: student.display_name,
            email: student.email,
            company: student.company || '未設定',
            department: student.department || '未設定',
            assignedCourses: validCourses,
            totalCourses: validCourses.length,
            completedCourses,
            inProgressCourses,
            notStartedCourses,
            overallProgress
          };
        })
      );

      setStudents(studentProgressData);
    } catch (error) {
      console.error('生徒の進捗取得エラー:', error);
      alert('生徒の進捗を取得できませんでした');
    } finally {
      setLoading(false);
    }
  };

  // フィルタリングとソート
  const filteredAndSortedStudents = students
    .filter(student => {
      // 会社フィルター
      if (companyFilter !== 'all' && student.company !== companyFilter) {
        return false;
      }

      // 検索フィルター
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        return (
          student.display_name.toLowerCase().includes(search) ||
          student.email.toLowerCase().includes(search) ||
          student.company.toLowerCase().includes(search)
        );
      }

      return true;
    })
    .sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.display_name.localeCompare(b.display_name);
          break;
        case 'company':
          comparison = a.company.localeCompare(b.company);
          break;
        case 'progress':
          comparison = a.overallProgress - b.overallProgress;
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const toggleSortOrder = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  };

  return (
    <AuthGuard requireAdmin>
      <MainLayout>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          {/* ヘッダー */}
          <div className="bg-white dark:bg-gray-800 shadow">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    受講状況
                  </h1>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    生徒別の受講状況を確認できます
                  </p>
                </div>
                <button
                  onClick={fetchStudentProgress}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  更新
                </button>
              </div>
            </div>
          </div>

          {/* フィルター・検索バー */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* 検索 */}
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="生徒名・メール検索..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>

                {/* 会社フィルター */}
                <div className="relative">
                  <FunnelIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <select
                    value={companyFilter}
                    onChange={(e) => setCompanyFilter(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 appearance-none"
                  >
                    <option value="all">全ての会社</option>
                    {companies.map(company => (
                      <option key={company} value={company}>{company}</option>
                    ))}
                  </select>
                </div>

                {/* ソート */}
                <div className="relative">
                  <ArrowsUpDownIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 appearance-none"
                  >
                    <option value="name">名前順</option>
                    <option value="company">会社順</option>
                    <option value="progress">進捗順</option>
                  </select>
                </div>

                {/* 並び順 */}
                <button
                  onClick={toggleSortOrder}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  {sortOrder === 'asc' ? '昇順' : '降順'}
                </button>
              </div>
            </div>

            {/* 統計サマリー */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex items-center">
                  <UserIcon className="h-8 w-8 text-blue-500" />
                  <div className="ml-3">
                    <p className="text-sm text-gray-600 dark:text-gray-400">総生徒数</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {filteredAndSortedStudents.length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex items-center">
                  <CheckCircleIcon className="h-8 w-8 text-green-500" />
                  <div className="ml-3">
                    <p className="text-sm text-gray-600 dark:text-gray-400">平均完了率</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {filteredAndSortedStudents.length > 0
                        ? Math.round(
                            filteredAndSortedStudents.reduce((sum, s) => sum + s.overallProgress, 0) /
                              filteredAndSortedStudents.length
                          )
                        : 0}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex items-center">
                  <AcademicCapIcon className="h-8 w-8 text-purple-500" />
                  <div className="ml-3">
                    <p className="text-sm text-gray-600 dark:text-gray-400">総コース数</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {filteredAndSortedStudents.reduce((sum, s) => sum + s.totalCourses, 0)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex items-center">
                  <ClockIcon className="h-8 w-8 text-orange-500" />
                  <div className="ml-3">
                    <p className="text-sm text-gray-600 dark:text-gray-400">受講中</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {filteredAndSortedStudents.reduce((sum, s) => sum + s.inProgressCourses, 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 生徒カード一覧 */}
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredAndSortedStudents.map((student) => (
                  <div
                    key={student.id}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow p-6"
                  >
                    {/* 生徒情報 */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                          {student.display_name}
                        </h3>
                        <div className="space-y-1">
                          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                            <BuildingOfficeIcon className="h-4 w-4 mr-2" />
                            {student.company}
                          </div>
                          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                            <EnvelopeIcon className="h-4 w-4 mr-2" />
                            {student.email}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 全体進捗バー */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          全体進捗
                        </span>
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                          {Math.round(student.overallProgress)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{ width: `${student.overallProgress}%` }}
                        />
                      </div>
                    </div>

                    {/* 受講状況 */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2 text-center">
                        <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400 mx-auto mb-1" />
                        <p className="text-xs text-gray-600 dark:text-gray-400">完了</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                          {student.completedCourses}
                        </p>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2 text-center">
                        <ClockIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mx-auto mb-1" />
                        <p className="text-xs text-gray-600 dark:text-gray-400">受講中</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                          {student.inProgressCourses}
                        </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2 text-center">
                        <AcademicCapIcon className="h-5 w-5 text-gray-600 dark:text-gray-400 mx-auto mb-1" />
                        <p className="text-xs text-gray-600 dark:text-gray-400">未受講</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                          {student.notStartedCourses}
                        </p>
                      </div>
                    </div>

                    {/* コース別進捗 */}
                    {student.assignedCourses.length > 0 && (
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                          コース別進捗 ({student.assignedCourses.length}件)
                        </p>
                        <div className="space-y-3 max-h-60 overflow-y-auto">
                          {student.assignedCourses.map((course) => (
                            <div
                              key={course.courseId}
                              className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3"
                            >
                              {/* コース名とステータス */}
                              <div className="flex items-start justify-between mb-2">
                                <h4 className="text-sm font-medium text-gray-900 dark:text-white flex-1 pr-2">
                                  {course.courseTitle}
                                </h4>
                                <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${
                                  course.status === 'completed'
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                    : course.status === 'in_progress'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                    : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-200'
                                }`}>
                                  {course.status === 'completed' ? '完了' :
                                   course.status === 'in_progress' ? '受講中' : '未受講'}
                                </span>
                              </div>

                              {/* 進捗バー */}
                              <div className="mb-2">
                                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                                  <div
                                    className={`h-1.5 rounded-full transition-all ${
                                      course.status === 'completed'
                                        ? 'bg-green-600'
                                        : course.status === 'in_progress'
                                        ? 'bg-blue-600'
                                        : 'bg-gray-400'
                                    }`}
                                    style={{ width: `${course.progress}%` }}
                                  />
                                </div>
                              </div>

                              {/* 統計情報 */}
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-600 dark:text-gray-400">
                                  {course.completedVideos} / {course.totalVideos}本視聴
                                </span>
                                <span className="font-semibold text-gray-900 dark:text-white">
                                  {Math.round(course.progress)}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* コースが割り当てられていない場合 */}
                    {student.assignedCourses.length === 0 && (
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                          コースが割り当てられていません
                        </p>
                      </div>
                    )}

                    {/* 詳細リンク */}
                    <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <Link
                        href={`/admin/users/${student.id}`}
                        className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                      >
                        詳細を見る →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 結果がない場合 */}
            {!loading && filteredAndSortedStudents.length === 0 && (
              <div className="text-center py-12">
                <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                  生徒が見つかりません
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  検索条件を変更してください
                </p>
              </div>
            )}
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
