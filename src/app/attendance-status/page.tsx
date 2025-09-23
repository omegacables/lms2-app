'use client';

import { useState, useEffect } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { supabase } from '@/lib/database/supabase';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { 
  CheckCircleIcon, 
  XCircleIcon,
  ClockIcon,
  PlayIcon,
  BuildingOfficeIcon,
  UserIcon,
  EnvelopeIcon
} from '@heroicons/react/24/outline';
import { CheckBadgeIcon } from '@heroicons/react/24/solid';

interface CourseProgress {
  courseId: string;
  courseName: string;
  userId: string;
  userName: string;
  userEmail: string;
  company: string;
  totalVideos: number;
  completedVideos: number;
  inProgressVideos: number;
  notStartedVideos: number;
  progressPercent: number;
  status: 'not_started' | 'in_progress' | 'completed';
}

export default function AttendanceStatusPage() {
  const { user, userProfile } = useAuth();
  const [progressData, setProgressData] = useState<CourseProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const isAdmin = userProfile?.role === 'admin' || false;

  useEffect(() => {
    fetchProgressData();
  }, [user?.id]);

  const fetchProgressData = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      if (isAdmin) {
        // 管理者: 全ユーザーの進捗を取得
        const { data: allUsers } = await supabase
          .from('user_profiles')
          .select('*');

        const { data: allCourses } = await supabase
          .from('courses')
          .select('*')
          .eq('status', 'active');

        const progressList: CourseProgress[] = [];

        for (const userData of allUsers || []) {
          for (const course of allCourses || []) {
            // 各コースの動画数を取得
            const { data: videos } = await supabase
              .from('videos')
              .select('id')
              .eq('course_id', course.id)
              .eq('status', 'active');

            const totalVideos = videos?.length || 0;

            // ユーザーの視聴ログを取得
            const { data: viewLogs } = await supabase
              .from('video_view_logs')
              .select('*')
              .eq('user_id', userData.id)
              .eq('course_id', course.id);

            const completedVideos = viewLogs?.filter(log => log.status === 'completed').length || 0;
            const inProgressVideos = viewLogs?.filter(log => log.status === 'in_progress').length || 0;
            const notStartedVideos = totalVideos - completedVideos - inProgressVideos;

            const progressPercent = totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0;
            
            let status: 'not_started' | 'in_progress' | 'completed' = 'not_started';
            if (completedVideos === totalVideos && totalVideos > 0) {
              status = 'completed';
            } else if (completedVideos > 0 || inProgressVideos > 0) {
              status = 'in_progress';
            }

            progressList.push({
              courseId: course.id,
              courseName: course.title,
              userId: userData.id,
              userName: userData.display_name || 'Unknown',
              userEmail: userData.email || '',
              company: userData.company || '未設定',
              totalVideos,
              completedVideos,
              inProgressVideos,
              notStartedVideos,
              progressPercent,
              status
            });
          }
        }

        setProgressData(progressList);
      } else {
        // 生徒: 自分の進捗のみ取得
        const { data: enrolledCourses } = await supabase
          .from('course_enrollments')
          .select(`
            *,
            courses:course_id (*)
          `)
          .eq('user_id', user.id);

        const progressList: CourseProgress[] = [];

        for (const enrollment of enrolledCourses || []) {
          const course = enrollment.courses;
          if (!course) continue;

          // 各コースの動画数を取得
          const { data: videos } = await supabase
            .from('videos')
            .select('id')
            .eq('course_id', course.id)
            .eq('status', 'active');

          const totalVideos = videos?.length || 0;

          // 視聴ログを取得
          const { data: viewLogs } = await supabase
            .from('video_view_logs')
            .select('*')
            .eq('user_id', user.id)
            .eq('course_id', course.id);

          const completedVideos = viewLogs?.filter(log => log.status === 'completed').length || 0;
          const inProgressVideos = viewLogs?.filter(log => log.status === 'in_progress').length || 0;
          const notStartedVideos = totalVideos - completedVideos - inProgressVideos;

          const progressPercent = totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0;
          
          let status: 'not_started' | 'in_progress' | 'completed' = 'not_started';
          if (completedVideos === totalVideos && totalVideos > 0) {
            status = 'completed';
          } else if (completedVideos > 0 || inProgressVideos > 0) {
            status = 'in_progress';
          }

          progressList.push({
            courseId: course.id,
            courseName: course.title,
            userId: user.id,
            userName: userProfile?.display_name || 'Unknown',
            userEmail: user.email || '',
            company: userProfile?.company || '未設定',
            totalVideos,
            completedVideos,
            inProgressVideos,
            notStartedVideos,
            progressPercent,
            status
          });
        }

        setProgressData(progressList);
      }
    } catch (error) {
      console.error('進捗データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  // フィルタリング
  const companies = [...new Set(progressData.map(p => p.company))];
  
  const filteredData = progressData.filter(progress => {
    const matchesSearch = 
      progress.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      progress.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      progress.courseName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCompany = filterCompany === 'all' || progress.company === filterCompany;
    const matchesStatus = filterStatus === 'all' || progress.status === filterStatus;
    
    return matchesSearch && matchesCompany && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircleIcon className="h-3 w-3 mr-1" />
            完了
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <ClockIcon className="h-3 w-3 mr-1" />
            受講中
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-neutral-900 text-gray-800 dark:text-gray-200">
            <XCircleIcon className="h-3 w-3 mr-1" />
            未受講
          </span>
        );
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="flex justify-center items-center min-h-[400px]">
            <LoadingSpinner size="lg" />
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">受講状況</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {isAdmin ? '全ユーザーの受講進捗を確認できます' : 'あなたの受講進捗を確認できます'}
            </p>
          </div>

          {/* フィルター */}
          <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-lg shadow mb-6 p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">検索</label>
                <input
                  type="text"
                  placeholder="名前、メール、コース名で検索..."
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">会社</label>
                  <select
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                    value={filterCompany}
                    onChange={(e) => setFilterCompany(e.target.value)}
                  >
                    <option value="all">すべて</option>
                    {companies.map(company => (
                      <option key={company} value={company}>{company}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ステータス</label>
                <select
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="all">すべて</option>
                  <option value="not_started">未受講</option>
                  <option value="in_progress">受講中</option>
                  <option value="completed">完了</option>
                </select>
              </div>
            </div>
          </div>

          {/* 進捗カード一覧 */}
          <div className="space-y-4">
            {filteredData.map((progress, index) => (
              <div key={`${progress.userId}-${progress.courseId}-${index}`} className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border border-gray-200 dark:border-neutral-800 overflow-hidden">
                {/* ヘッダー */}
                <div className="bg-gradient-to-r from-purple-600 to-purple-700 p-4 text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      {isAdmin && (
                        <>
                          <div className="flex items-center space-x-2">
                            <BuildingOfficeIcon className="h-4 w-4" />
                            <span className="text-sm font-medium">{progress.company}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <UserIcon className="h-4 w-4" />
                            <span className="text-sm">{progress.userName}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <EnvelopeIcon className="h-4 w-4" />
                            <span className="text-sm">{progress.userEmail}</span>
                          </div>
                        </>
                      )}
                      <div className="font-semibold">{progress.courseName}</div>
                    </div>
                    <div className="text-2xl font-bold">{progress.progressPercent}%</div>
                  </div>
                </div>

                {/* 統計 */}
                <div className="p-4">
                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{progress.notStartedVideos}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">未受講</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-600">{progress.inProgressVideos}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">受講中</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{progress.completedVideos}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">完了</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{progress.totalVideos}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">合計</div>
                    </div>
                  </div>

                  {/* プログレスバー */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <PlayIcon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {progress.completedVideos}/{progress.totalVideos}本視聴
                        </span>
                      </div>
                      {getStatusBadge(progress.status)}
                    </div>
                    
                    <div className="relative">
                      <div className="bg-gray-200 rounded-full h-3">
                        <div 
                          className={`h-3 rounded-full transition-all duration-500 ${
                            progress.status === 'completed' ? 'bg-green-50 dark:bg-green-900/200' :
                            progress.status === 'in_progress' ? 'bg-blue-50 dark:bg-blue-900/200' : 'bg-gray-300'
                          }`}
                          style={{ width: `${progress.progressPercent}%` }}
                        />
                      </div>
                      {progress.progressPercent > 0 && (
                        <div className="absolute -top-1 -right-1">
                          {progress.status === 'completed' && (
                            <CheckBadgeIcon className="h-5 w-5 text-green-500" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredData.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">該当する受講状況が見つかりません</p>
            </div>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}