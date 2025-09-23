'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/database/supabase';
import { useAuth } from '@/stores/auth';
import {
  ArrowLeftIcon,
  PlayCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  ChartBarIcon,
  CalendarIcon,
  FireIcon
} from '@heroicons/react/24/outline';
import type { Tables } from '@/lib/database/supabase';

type Video = Tables<'videos'> & {
  viewLog?: Tables<'video_view_logs'>;
};

type Course = Tables<'courses'> & {
  videos?: Video[];
};


export default function CourseProgressPage() {
  const params = useParams();
  const { user } = useAuth();
  const courseId = params?.id as string;
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    completedVideos: 0,
    totalVideos: 0,
    totalWatchTime: 0,
    averageProgress: 0,
    lastAccessDate: null as string | null,
    estimatedCompletion: 0
  });

  useEffect(() => {
    if (courseId && user) {
      fetchCourseProgress();
    }
  }, [courseId, user]);

  const fetchCourseProgress = async () => {
    try {
      setLoading(true);

      // Fetch course details
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (courseError || !courseData) {
        console.error('Error fetching course:', courseError);
        return;
      }

      // Fetch videos with view logs
      const { data: videos, error: videosError } = await supabase
        .from('videos')
        .select('*')
        .eq('course_id', courseId)
        .eq('status', 'active')
        .order('order_index', { ascending: true });

      if (videosError) {
        console.error('Error fetching videos:', videosError);
        return;
      }

      // Fetch view logs for the user
      const { data: viewLogs, error: logsError } = await supabase
        .from('video_view_logs')
        .select('*')
        .eq('user_id', user?.id)
        .eq('course_id', courseId);

      if (logsError) {
        console.error('Error fetching view logs:', logsError);
      }

      // Combine videos with their view logs
      const videosWithLogs = videos?.map(video => {
        const viewLog = viewLogs?.find(log => log.video_id === video.id);
        return {
          ...video,
          viewLog
        };
      }) || [];

      // Calculate statistics
      const completedVideos = videosWithLogs.filter(v => v.viewLog?.status === 'completed').length;
      const totalVideos = videosWithLogs.length;
      const totalWatchTime = viewLogs?.reduce((sum, log) => sum + (log.total_watched_time || 0), 0) || 0;
      const averageProgress = totalVideos > 0
        ? Math.round((completedVideos / totalVideos) * 100)
        : 0;

      const lastLog = viewLogs?.reduce((latest, log) =>
        !latest || new Date(log.last_updated) > new Date(latest.last_updated) ? log : latest,
        null as any
      );

      const lastAccessDate = lastLog?.last_updated || null;

      // Estimate completion time (based on average watch time per video)
      const remainingVideos = totalVideos - completedVideos;
      const avgTimePerVideo = completedVideos > 0 ? totalWatchTime / completedVideos : 600; // Default 10 minutes
      const estimatedCompletion = remainingVideos * avgTimePerVideo;

      setCourse({
        ...courseData,
        videos: videosWithLogs
      });

      setStats({
        completedVideos,
        totalVideos,
        totalWatchTime,
        averageProgress,
        lastAccessDate,
        estimatedCompletion
      });

    } catch (error) {
      console.error('Error fetching course progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}時間${minutes}分`;
    }
    if (minutes > 0) {
      return `${minutes}分${secs}秒`;
    }
    return `${secs}秒`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '未視聴';
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getVideoStatusIcon = (video: Video) => {
    if (video.viewLog?.status === 'completed') {
      return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
    }
    if (video.viewLog && video.viewLog.progress_percent > 0) {
      return <PlayCircleIcon className="h-5 w-5 text-blue-500" />;
    }
    return <PlayCircleIcon className="h-5 w-5 text-gray-400" />;
  };

  const getVideoProgressColor = (percent: number) => {
    if (percent === 100) return 'bg-green-500';
    if (percent >= 50) return 'bg-blue-500';
    if (percent > 0) return 'bg-yellow-500';
    return 'bg-gray-300';
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

  if (!course) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              コースが見つかりません
            </h2>
            <Link href="/my-courses">
              <Button>マイコースへ戻る</Button>
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
          <div className="mb-8">
            <Link
              href="/my-courses"
              className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-2" />
              マイコースへ戻る
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {course.title} - 進捗詳細
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              あなたの学習進捗と詳細な統計情報
            </p>
          </div>

          {/* Overall Progress */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 mb-8 border border-gray-200 dark:border-neutral-800">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">全体進捗</h2>
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-700 dark:text-gray-300">
                  完了: {stats.completedVideos}/{stats.totalVideos} 動画
                </span>
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.averageProgress}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                <div
                  className="h-4 bg-green-500 rounded-full transition-all duration-300"
                  style={{ width: `${stats.averageProgress}%` }}
                />
              </div>
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 border border-gray-200 dark:border-neutral-800">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircleIcon className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stats.completedVideos}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">完了動画</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 border border-gray-200 dark:border-neutral-800">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <ClockIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatDuration(stats.totalWatchTime)}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">総視聴時間</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 border border-gray-200 dark:border-neutral-800">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <CalendarIcon className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {stats.lastAccessDate
                      ? new Date(stats.lastAccessDate).toLocaleDateString('ja-JP')
                      : '未視聴'}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">最終学習日</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 border border-gray-200 dark:border-neutral-800">
              <div className="flex items-center">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <FireIcon className="h-6 w-6 text-orange-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatDuration(stats.estimatedCompletion)}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">完了予想時間</p>
                </div>
              </div>
            </div>
          </div>

          {/* Video Progress List */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 border border-gray-200 dark:border-neutral-800">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">動画別進捗</h2>
            <div className="space-y-4">
              {course.videos?.map((video, index) => (
                <div
                  key={video.id}
                  className="border border-gray-200 dark:border-neutral-800 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div className="mt-1">
                        {getVideoStatusIcon(video)}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {index + 1}. {video.title}
                        </h3>
                        {video.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {video.description}
                          </p>
                        )}
                        <div className="mt-3 space-y-2">
                          {/* Progress Bar */}
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-gray-600 dark:text-gray-400">
                                進捗: {video.viewLog?.progress_percent || 0}%
                              </span>
                              <span className="text-gray-600 dark:text-gray-400">
                                視聴時間: {formatDuration(video.viewLog?.total_watched_time || 0)}
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full transition-all duration-300 ${getVideoProgressColor(video.viewLog?.progress_percent || 0)}`}
                                style={{ width: `${video.viewLog?.progress_percent || 0}%` }}
                              />
                            </div>
                          </div>
                          {/* Last Watched */}
                          {video.viewLog && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              最終視聴: {formatDate(video.viewLog.last_updated)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="ml-4">
                      <Link href={`/courses/${courseId}/videos/${video.id}`}>
                        <Button size="sm" variant="outline">
                          {video.viewLog?.status === 'completed' ? '復習' : '視聴'}
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between items-center mt-8">
            <Link href={`/courses/${courseId}`}>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <PlayCircleIcon className="h-5 w-5 mr-2" />
                学習を続ける
              </Button>
            </Link>
            {stats.averageProgress === 100 && (
              <Link href={`/certificates/${courseId}`}>
                <Button variant="outline" className="text-yellow-700 border-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-900/20">
                  <ChartBarIcon className="h-5 w-5 mr-2" />
                  証明書を表示
                </Button>
              </Link>
            )}
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}