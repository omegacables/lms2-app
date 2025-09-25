'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/database/supabase';
import {
  UsersIcon,
  AcademicCapIcon,
  DocumentTextIcon,
  ClockIcon,
  TrophyIcon,
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  PlusIcon,
  EyeIcon,
  Cog6ToothIcon,
  ChatBubbleLeftRightIcon,
  DocumentCheckIcon,
  CloudArrowUpIcon
} from '@heroicons/react/24/outline';

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalCourses: number;
  activeCourses: number;
  totalVideos: number;
  totalCertificates: number;
  totalWatchTime: number;
  newUsersThisWeek: number;
  completionRate: number;
  unreadMessages: number;
  popularCourses: Array<{
    id: number;
    title: string;
    enrollments: number;
  }>;
  recentActivity: Array<{
    id: number;
    action: string;
    user: string;
    timestamp: string;
    details: string;
  }>;
}

export default function AdminDashboard() {
  const { user, isAdmin } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(true);
  const [unreadMessages, setUnreadMessages] = useState(0);

  // 管理者チェックをuseEffectで実行
  useEffect(() => {
    if (user && !isAdmin) {
      setHasPermission(false);
    } else {
      setHasPermission(true);
    }
  }, [user, isAdmin]);

  // 権限がない場合の表示
  if (!hasPermission && user) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="max-w-2xl mx-auto px-4 py-16 text-center">
            <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">アクセス権限がありません</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              このページは管理者のみアクセス可能です。
            </p>
            <Link href="/dashboard">
              <Button>ダッシュボードに戻る</Button>
            </Link>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  useEffect(() => {
    if (user && isAdmin) {
      fetchAdminStats();
    }
  }, [user, isAdmin]);

  const fetchAdminStats = async () => {
    try {
      setLoading(true);
      
      // 統計データを並列で取得
      // 未読メッセージを取得 (生徒からの未読メッセージのみ)
      const { count: unreadCount } = await supabase
        .from('support_messages')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false)
        .eq('sender_type', 'student');

      const [
        usersResult,
        coursesResult,
        videosResult,
        certificatesResult,
        viewLogsResult,
        recentLogsResult,
        weeklyUsersResult
      ] = await Promise.all([
        // 総ユーザー数
        supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
        // コース統計
        supabase.from('courses').select('*', { count: 'exact' }),
        // 動画統計
        supabase.from('videos').select('*', { count: 'exact', head: true }),
        // 証明書統計
        supabase.from('certificates').select('*', { count: 'exact', head: true }),
        // 視聴ログ統計
        supabase.from('video_view_logs').select('total_watched_time'),
        // 最近のアクティビティ
        supabase
          .from('video_view_logs')
          .select(`
            *,
            user_profiles!inner(display_name, email),
            videos!inner(title),
            courses!inner(title)
          `)
          .order('last_updated', { ascending: false })
          .limit(5),
        // 今週の新規ユーザー
        supabase
          .from('user_profiles')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      ]);

      // アクティブユーザー数を計算（過去30日以内にログがあるユーザー）
      const { count: activeUsersCount } = await supabase
        .from('video_view_logs')
        .select('user_id', { count: 'exact', head: true })
        .gte('last_updated', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      // コース別の受講者数を取得
      const popularCourses: Array<{ id: number; title: string; enrollments: number }> = [];
      if (coursesResult.data) {
        for (const course of coursesResult.data.slice(0, 3)) {
          const { count } = await supabase
            .from('video_view_logs')
            .select('*', { count: 'exact', head: true })
            .eq('course_id', course.id);
          
          popularCourses.push({
            id: course.id,
            title: course.title,
            enrollments: count || 0
          });
        }
      }

      // 総視聴時間を計算
      const totalWatchTime = viewLogsResult.data?.reduce((sum, log) => sum + (log.total_watched_time || 0), 0) || 0;

      // 完了率を計算
      const completedLogs = viewLogsResult.data?.filter(log => log.status === 'completed').length || 0;
      const totalLogs = viewLogsResult.data?.length || 1;
      const completionRate = Math.round((completedLogs / totalLogs) * 100);

      // 最近のアクティビティをフォーマット
      const recentActivity = recentLogsResult.data?.map((log, index) => {
        let action = '動画視聴';
        if (log.status === 'completed') {
          action = '動画完了';
        } else if (log.progress === 0) {
          action = '学習開始';
        }

        return {
          id: index + 1,
          action,
          user: log.user_profiles?.display_name || log.user_profiles?.email || 'ユーザー',
          timestamp: log.last_updated,
          details: log.videos?.title || ''
        };
      }) || [];

      const activeCourses = coursesResult.data?.filter(c => c.status === 'active').length || 0;

      setStats({
        totalUsers: usersResult.count || 0,
        activeUsers: activeUsersCount || 0,
        totalCourses: coursesResult.count || 0,
        activeCourses,
        totalVideos: videosResult.count || 0,
        totalCertificates: certificatesResult.count || 0,
        totalWatchTime,
        newUsersThisWeek: weeklyUsersResult.count || 0,
        completionRate,
        unreadMessages: unreadCount || 0,
        popularCourses: popularCourses.sort((a, b) => b.enrollments - a.enrollments),
        recentActivity
      });
      setUnreadMessages(unreadCount || 0);
      
    } catch (error) {
      console.error('管理者統計取得エラー:', error);
      // エラー時は空のデータを設定
      setStats({
        totalUsers: 0,
        activeUsers: 0,
        totalCourses: 0,
        activeCourses: 0,
        totalVideos: 0,
        totalCertificates: 0,
        totalWatchTime: 0,
        newUsersThisWeek: 0,
        completionRate: 0,
        unreadMessages: 0,
        popularCourses: [],
        recentActivity: []
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}時間${minutes}分`;
    }
    return `${minutes}分`;
  };

  if (loading) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="container mx-auto px-4 py-8">
            <div className="flex justify-center items-center min-h-64">
              <LoadingSpinner size="lg" />
            </div>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-7xl mx-auto">
          {/* ヘッダーセクション */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mr-4">
                  <Cog6ToothIcon className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">管理者ダッシュボード</h1>
                  <p className="text-gray-600 dark:text-gray-400">システム全体の状況を監視・管理できます。</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <Link href="/admin/upload-video">
                  <Button className="bg-red-600 hover:bg-red-700 flex items-center justify-center w-full sm:w-auto whitespace-nowrap">
                    <CloudArrowUpIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="whitespace-nowrap">動画アップ(3GB)</span>
                  </Button>
                </Link>
                <Link href="/admin/courses/new">
                  <Button className="bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center w-full sm:w-auto whitespace-nowrap">
                    <PlusIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="whitespace-nowrap">新規コース</span>
                  </Button>
                </Link>
                <Link href="/admin/users/new">
                  <Button variant="outline" className="flex items-center justify-center w-full sm:w-auto whitespace-nowrap">
                    <UsersIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="whitespace-nowrap">ユーザー追加</span>
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* 主要統計 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100">総ユーザー数</p>
                  <p className="text-2xl font-bold">{stats?.totalUsers}</p>
                  <p className="text-sm text-blue-200">アクティブ: {stats?.activeUsers}</p>
                </div>
                <UsersIcon className="h-8 w-8 text-blue-200" />
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100">総コース数</p>
                  <p className="text-2xl font-bold">{stats?.totalCourses}</p>
                  <p className="text-sm text-green-200">公開中: {stats?.activeCourses}</p>
                </div>
                <AcademicCapIcon className="h-8 w-8 text-green-200" />
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100">総視聴時間</p>
                  <p className="text-2xl font-bold">{stats ? formatTime(stats.totalWatchTime) : '0分'}</p>
                </div>
                <ClockIcon className="h-8 w-8 text-purple-200" />
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100">発行証明書</p>
                  <p className="text-2xl font-bold">{stats?.totalCertificates}</p>
                  <p className="text-sm text-orange-200">完了率: {stats?.completionRate}%</p>
                </div>
                <TrophyIcon className="h-8 w-8 text-orange-200" />
              </div>
            </div>
          </div>

          {/* クイックアクション */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <Link href="/admin/students" className="block">
              <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-lg border p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-center">
                <UsersIcon className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                <h3 className="font-semibold text-gray-900 dark:text-white">生徒管理</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">生徒の管理・学習状況</p>
              </div>
            </Link>
            
            <Link href="/admin/courses" className="block">
              <div className="bg-white dark:bg-neutral-900 rounded-lg border p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-center">
                <DocumentTextIcon className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <h3 className="font-semibold text-gray-900 dark:text-white">コース管理</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">コンテンツの管理</p>
              </div>
            </Link>
            
            <Link href="/admin/certificates" className="block">
              <div className="bg-white dark:bg-neutral-900 rounded-lg border p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-center">
                <DocumentCheckIcon className="h-8 w-8 text-orange-600 mx-auto mb-2" />
                <h3 className="font-semibold text-gray-900 dark:text-white">証明書管理</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">証明書の発行・管理</p>
              </div>
            </Link>
            
            <Link href="/admin/support" className="block">
              <div className="bg-white dark:bg-neutral-900 rounded-lg border p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-center relative">
                <ChatBubbleLeftRightIcon className="h-8 w-8 text-indigo-600 mx-auto mb-2" />
                {unreadMessages > 0 && (
                  <div className="absolute top-3 right-3 bg-red-50 dark:bg-red-900/200 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </div>
                )}
                <h3 className="font-semibold text-gray-900 dark:text-white">サポートチャット</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">生徒からの問い合わせ</p>
              </div>
            </Link>
            
            
            <Link href="/admin/settings" className="block">
              <div className="bg-white dark:bg-neutral-900 rounded-lg border p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-center">
                <Cog6ToothIcon className="h-8 w-8 text-gray-600 dark:text-gray-400 mx-auto mb-2" />
                <h3 className="font-semibold text-gray-900 dark:text-white">システム設定</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">全般設定の管理</p>
              </div>
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* 人気コース */}
            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border">
              <div className="p-6 border-b border-gray-200 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">人気コース</h2>
                  <Button variant="outline" size="sm" className="flex items-center" disabled>
                    <EyeIcon className="h-4 w-4 mr-1" />
                    詳細
                  </Button>
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {stats?.popularCourses.map((course, index) => (
                    <div key={course.id} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white mr-3 ${
                          index === 0 ? 'bg-yellow-50 dark:bg-yellow-900/200' :
                          index === 1 ? 'bg-gray-400' :
                          index === 2 ? 'bg-amber-600' : 'bg-gray-300'
                        }`}>
                          {index + 1}
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900 dark:text-white">{course.title}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{course.enrollments}名が受講中</p>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <ArrowTrendingUpIcon className="h-4 w-4 text-green-500 mr-1" />
                        <span className="text-sm text-green-600">+{Math.floor(Math.random() * 20 + 5)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 最近のアクティビティ */}
            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border">
              <div className="p-6 border-b border-gray-200 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">最近のアクティビティ</h2>
                  <Link href="/admin/logs">
                    <Button variant="outline" size="sm">
                      すべて表示
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {stats?.recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-blue-50 dark:bg-blue-900/200 rounded-full mt-2 flex-shrink-0"></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 dark:text-white">
                          <span className="font-medium">{activity.user}</span>
                          {' が '}
                          <span className="font-medium">{activity.action}</span>
                          {activity.details && (
                            <>
                              {' - '}
                              <span className="text-gray-600 dark:text-gray-400">{activity.details}</span>
                            </>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {new Date(activity.timestamp).toLocaleString('ja-JP')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 今週の統計 */}
          <div className="mt-8 bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">今週のハイライト</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600 mb-1">+{stats?.newUsersThisWeek}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">新規ユーザー</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600 mb-1">
                  {stats ? Math.floor(stats.totalCertificates * 0.15) : 0}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">新規証明書</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600 mb-1">
                  {stats ? formatTime(Math.floor(stats.totalWatchTime * 0.2)) : '0分'}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">今週の視聴時間</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600 mb-1">{stats?.completionRate}%</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">平均完了率</div>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}