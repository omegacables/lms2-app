'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import { useAuth } from '@/stores/auth';
import { CourseCertificate } from '@/components/certificate/CourseCertificate';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import type { Tables } from '@/lib/database/supabase';

type Course = Tables<'courses'>;
type Video = Tables<'videos'>;
type VideoViewLog = Tables<'video_view_logs'>;

export default function CourseCertificatePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const courseId = params.id as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [viewLogs, setViewLogs] = useState<VideoViewLog[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (courseId && user) {
      fetchData();
    }
  }, [courseId, user]);

  const fetchData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // コース情報を取得
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (courseError) throw courseError;
      setCourse(courseData);

      // 動画一覧を取得
      const { data: videosData, error: videosError } = await supabase
        .from('videos')
        .select('*')
        .eq('course_id', courseId)
        .eq('status', 'active')
        .order('order_index', { ascending: true });

      if (videosError) throw videosError;
      setVideos(videosData || []);

      // 視聴ログを取得
      const { data: logsData, error: logsError } = await supabase
        .from('video_view_logs')
        .select('*')
        .eq('course_id', courseId)
        .eq('user_id', user.id);

      if (logsError) console.error('視聴ログ取得エラー:', logsError);
      setViewLogs(logsData || []);

      // ユーザープロフィールを取得
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      setUserProfile(profileData);

    } catch (err) {
      console.error('データ取得エラー:', err);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const calculateCourseProgress = () => {
    if (videos.length === 0) return 0;
    const completedCount = viewLogs.filter(log => log.status === 'completed').length;
    return Math.round((completedCount / videos.length) * 100);
  };

  const getCompletedCount = () => {
    return viewLogs.filter(log => log.status === 'completed').length;
  };

  const getTotalWatchTime = () => {
    return viewLogs.reduce((sum, log) => sum + (log.total_watched_time || 0), 0);
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

  if (error || !course) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="text-center py-8">
            <p className="text-red-600">{error || 'コースが見つかりません'}</p>
            <Link href="/my-courses">
              <Button className="mt-4">コース一覧に戻る</Button>
            </Link>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  const progress = calculateCourseProgress();
  const isCompleted = progress >= 95;

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* ヘッダー */}
          <div className="mb-8">
            <Link href={`/courses/${courseId}`}>
              <Button variant="outline" size="sm" className="mb-4">
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                コースに戻る
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {course.title} - 修了証明書
            </h1>
          </div>

          {/* 証明書セクション */}
          {isCompleted && userProfile ? (
            <CourseCertificate
              course={course}
              user={userProfile}
              completionDate={new Date()}
              progress={{
                completedVideos: getCompletedCount(),
                totalVideos: videos.length,
                totalWatchTime: getTotalWatchTime()
              }}
            />
          ) : (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-8 text-center">
              <h2 className="text-xl font-semibold text-yellow-800 dark:text-yellow-400 mb-4">
                証明書を発行するには
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-6">
                このコースの全ての動画を視聴完了すると、修了証明書が発行されます。
              </p>
              <div className="mb-6">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  現在の進捗: {getCompletedCount()} / {videos.length} 動画完了
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  {progress}% 完了
                </div>
              </div>
              <Link href={`/courses/${courseId}`}>
                <Button>コースを続ける</Button>
              </Link>
            </div>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}