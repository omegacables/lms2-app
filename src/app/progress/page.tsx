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
  ChartBarIcon,
  ClockIcon,
  PlayIcon,
  CheckCircleIcon,
  CalendarIcon,
  TrophyIcon,
  ArrowTrendingUpIcon,
  BookOpenIcon,
  FireIcon
} from '@heroicons/react/24/outline';
import type { Tables } from '@/lib/database/supabase';

type VideoViewLog = Tables<'video_view_logs'> & {
  videos?: {
    title: string;
    duration_seconds: number;
  };
  courses?: {
    title: string;
    category_id: number;
  };
};

type ProgressData = {
  courseId: number;
  courseTitle: string;
  totalVideos: number;
  completedVideos: number;
  totalDuration: number;
  watchedDuration: number;
  progressPercent: number;
  status: 'not_started' | 'in_progress' | 'completed';
  lastWatchedAt: string | null;
};

export default function ProgressPage() {
  const { user } = useAuth();
  const [viewLogs, setViewLogs] = useState<VideoViewLog[]>([]);
  const [progressData, setProgressData] = useState<ProgressData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [stats, setStats] = useState({
    totalWatchTime: 0,
    completedCourses: 0,
    currentStreak: 0,
    weeklyGoalHours: 5,
    weeklyWatchedHours: 0,
  });

  // モック進捗データ
  const mockProgressData: ProgressData[] = [
    {
      courseId: 1,
      courseTitle: 'JavaScript基礎講座',
      totalVideos: 12,
      completedVideos: 12,
      totalDuration: 7200,
      watchedDuration: 7200,
      progressPercent: 100,
      status: 'completed',
      lastWatchedAt: '2024-01-15T10:00:00Z',
    },
    {
      courseId: 2,
      courseTitle: 'React入門',
      totalVideos: 8,
      completedVideos: 5,
      totalDuration: 4800,
      watchedDuration: 3000,
      progressPercent: 62.5,
      status: 'in_progress',
      lastWatchedAt: '2024-01-20T14:30:00Z',
    },
    {
      courseId: 3,
      courseTitle: 'データベース設計',
      totalVideos: 6,
      completedVideos: 6,
      totalDuration: 3600,
      watchedDuration: 3600,
      progressPercent: 100,
      status: 'completed',
      lastWatchedAt: '2024-01-18T09:15:00Z',
    },
    {
      courseId: 4,
      courseTitle: 'Node.js実践',
      totalVideos: 10,
      completedVideos: 0,
      totalDuration: 6000,
      watchedDuration: 0,
      progressPercent: 0,
      status: 'not_started',
      lastWatchedAt: null,
    },
  ];

  useEffect(() => {
    // モックデータを使用
    setProgressData(mockProgressData);
    setStats({
      totalWatchTime: 13800, // 約3.8時間
      completedCourses: 2,
      currentStreak: 7,
      weeklyGoalHours: 5,
      weeklyWatchedHours: 2.5,
    });
    setLoading(false);
  }, []);

  const fetchProgressData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // ユーザーの視聴ログを取得
      const { data: logs, error } = await supabase
        .from('video_view_logs')
        .select(`
          *,
          videos(title, duration_seconds),
          courses(title, category_id)
        `)
        .eq('user_id', user.id)
        .order('last_updated', { ascending: false });

      if (error) {
        console.error('進捗データ取得エラー:', error);
        return;
      }

      setViewLogs(logs || []);
      
      // コース別進捗を計算
      const courseProgress = new Map<number, ProgressData>();
      
      logs?.forEach(log => {
        const courseId = log.course_id;
        if (!courseProgress.has(courseId)) {
          courseProgress.set(courseId, {
            courseId: courseId,
            courseTitle: log.courses?.title || 'コース名未設定',
            totalVideos: 0,
            completedVideos: 0,
            totalDuration: 0,
            watchedDuration: 0,
            progressPercent: 0,
            status: 'not_started',
            lastWatchedAt: null,
          });
        }
        
        const progress = courseProgress.get(courseId)!;
        progress.totalVideos++;
        progress.totalDuration += log.videos?.duration_seconds || 0;
        progress.watchedDuration += log.total_watched_time;
        
        if (log.status === 'completed') {
          progress.completedVideos++;
        }
        
        if (!progress.lastWatchedAt || new Date(log.last_updated) > new Date(progress.lastWatchedAt)) {
          progress.lastWatchedAt = log.last_updated;
        }
      });

      // 進捗率計算とステータス設定
      const progressArray = Array.from(courseProgress.values()).map(progress => {
        progress.progressPercent = progress.totalDuration > 0 
          ? (progress.watchedDuration / progress.totalDuration) * 100 
          : 0;
        
        if (progress.progressPercent >= 95) {
          progress.status = 'completed';
        } else if (progress.progressPercent > 0) {
          progress.status = 'in_progress';
        } else {
          progress.status = 'not_started';
        }
        
        return progress;
      });

      setProgressData(progressArray);
      
      // 統計計算
      const totalWatchTime = logs?.reduce((sum, log) => sum + log.total_watched_time, 0) || 0;
      const completedCourses = progressArray.filter(p => p.status === 'completed').length;
      
      setStats(prev => ({
        ...prev,
        totalWatchTime,
        completedCourses,
      }));

    } catch (error) {
      console.error('進捗データ取得エラー:', error);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'not_started':
        return 'bg-gray-100 dark:bg-neutral-900 text-gray-800 dark:text-gray-200';
      default:
        return 'bg-gray-100 dark:bg-neutral-900 text-gray-800 dark:text-gray-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return '完了';
      case 'in_progress':
        return '学習中';
      case 'not_started':
        return '未開始';
      default:
        return '不明';
    }
  };

  const weeklyGoalProgress = (stats.weeklyWatchedHours / stats.weeklyGoalHours) * 100;

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* ヘッダーセクション */}
          <div className="mb-8">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                <ChartBarIcon className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">学習進捗</h1>
                <p className="text-gray-600 dark:text-gray-400">あなたの学習状況を詳しく確認できます。</p>
              </div>
            </div>
          </div>

          {/* 統計サマリー */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100">総学習時間</p>
                  <p className="text-2xl font-bold">{formatTime(stats.totalWatchTime)}</p>
                </div>
                <ClockIcon className="h-8 w-8 text-blue-200" />
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100">完了コース</p>
                  <p className="text-2xl font-bold">{stats.completedCourses}</p>
                </div>
                <TrophyIcon className="h-8 w-8 text-green-200" />
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100">連続学習</p>
                  <p className="text-2xl font-bold">{stats.currentStreak}日</p>
                </div>
                <FireIcon className="h-8 w-8 text-orange-200" />
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100">全体進捗</p>
                  <p className="text-2xl font-bold">
                    {progressData.length > 0 
                      ? Math.round((stats.completedCourses / progressData.length) * 100)
                      : 0}%
                  </p>
                </div>
                <ArrowTrendingUpIcon className="h-8 w-8 text-purple-200" />
              </div>
            </div>
          </div>

          {/* 今週の学習目標 */}
          <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">今週の学習目標</h2>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {stats.weeklyWatchedHours}時間 / {stats.weeklyGoalHours}時間
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{Math.min(100, weeklyGoalProgress).toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, weeklyGoalProgress)}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              {weeklyGoalProgress >= 100 
                ? '🎉 今週の目標を達成しました！' 
                : `目標まであと${(stats.weeklyGoalHours - stats.weeklyWatchedHours).toFixed(1)}時間です。`
              }
            </p>
          </div>

          {/* コース別進捗 */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border mb-8">
            <div className="p-6 border-b border-gray-200 dark:border-neutral-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">コース別進捗</h2>
            </div>
            
            {progressData.length === 0 ? (
              <div className="p-8 text-center">
                <BookOpenIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">学習データがありません</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">コースを開始すると、ここに進捗が表示されます。</p>
                <Link href="/my-courses">
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    コースを探す
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {progressData.map(progress => (
                  <div key={progress.courseId} className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {progress.courseTitle}
                          </h3>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(progress.status)}`}>
                            {progress.status === 'completed' && <CheckCircleIcon className="h-3 w-3 mr-1" />}
                            {getStatusLabel(progress.status)}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600 dark:text-gray-400">
                          <div>
                            <span className="font-medium">進捗: </span>
                            {progress.progressPercent.toFixed(1)}%
                          </div>
                          <div>
                            <span className="font-medium">動画: </span>
                            {progress.completedVideos} / {progress.totalVideos}
                          </div>
                          <div>
                            <span className="font-medium">視聴時間: </span>
                            {formatTime(progress.watchedDuration)}
                          </div>
                          {progress.lastWatchedAt && (
                            <div>
                              <span className="font-medium">最終学習: </span>
                              {new Date(progress.lastWatchedAt).toLocaleDateString('ja-JP')}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="ml-4">
                        <Link href={`/courses/${progress.courseId}`}>
                          <Button
                            size="sm"
                            variant={progress.status === 'not_started' ? 'primary' : 'outline'}
                            className="flex items-center"
                          >
                            <PlayIcon className="h-4 w-4 mr-1" />
                            {progress.status === 'not_started' ? '開始' : '続ける'}
                          </Button>
                        </Link>
                      </div>
                    </div>
                    
                    {/* プログレスバー */}
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-500 ${
                          progress.status === 'completed' 
                            ? 'bg-gradient-to-r from-green-500 to-green-600' 
                            : 'bg-gradient-to-r from-blue-500 to-blue-600'
                        }`}
                        style={{ width: `${progress.progressPercent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 学習カレンダー */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">学習アクティビティ</h2>
              <select
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
              >
                <option value="week">今週</option>
                <option value="month">今月</option>
                <option value="year">今年</option>
              </select>
            </div>
            
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <CalendarIcon className="h-12 w-12 mx-auto mb-4" />
              <p>学習カレンダー機能は開発中です。</p>
              <p className="text-sm">今後のアップデートで追加予定です。</p>
            </div>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}