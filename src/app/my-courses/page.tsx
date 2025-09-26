'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import {
  BookOpenIcon,
  PlayIcon,
  ClockIcon,
  CheckCircleIcon,
  ChartBarIcon,
  AcademicCapIcon,
  TrophyIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';
import type { Tables } from '@/lib/database/supabase';
import { generateCertificatePDF } from '@/lib/utils/certificatePDF';

type Course = Tables<'courses'> & {
  videos?: Array<Tables<'videos'>>;
  progress?: number;
  completed_videos?: number;
  total_videos?: number;
  total_watch_time?: number;
  last_accessed?: string;
  certificate_earned?: boolean;
};

export default function MyCoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCourses: 0,
    completedCourses: 0,
    inProgressCourses: 0,
    totalWatchTime: 0
  });

  useEffect(() => {
    if (user) {
      fetchMyCourses();
    }
  }, [user]);

  const fetchMyCourses = async () => {
    try {
      setLoading(true);

      // Get user's assigned course IDs from user_course_assignments table
      const { data: assignments, error: assignError } = await supabase
        .from('user_course_assignments')
        .select('course_id')
        .eq('user_id', user?.id);

      if (assignError) {
        console.error('割り当てコース取得エラー:', assignError);
        return;
      }

      if (!assignments || assignments.length === 0) {
        setCourses([]);
        setStats({
          totalCourses: 0,
          completedCourses: 0,
          inProgressCourses: 0,
          totalWatchTime: 0
        });
        return;
      }

      // Get course details for assigned courses
      const courseIds = assignments.map(a => a.course_id);
      const { data: coursesData } = await supabase
        .from('courses')
        .select('*')
        .in('id', courseIds);

      if (!coursesData || coursesData.length === 0) {
        setCourses([]);
        setStats({
          totalCourses: 0,
          completedCourses: 0,
          inProgressCourses: 0,
          totalWatchTime: 0
        });
        return;
      }

      // Process each assigned course
      const coursesWithProgress = await Promise.all(
        coursesData.map(async (course) => {
          
          // Get videos for this course
          const { data: videos } = await supabase
            .from('videos')
            .select('*')
            .eq('course_id', course.id)
            .eq('status', 'active');

          const totalVideos = videos?.length || 0;

          // Get view logs for this course
          const { data: viewLogs } = await supabase
            .from('video_view_logs')
            .select('*')
            .eq('user_id', user?.id)
            .eq('course_id', course.id);

          let completedVideos = 0;
          let totalWatchTime = 0;
          let lastAccessed = new Date().toISOString();

          if (viewLogs && viewLogs.length > 0) {
            // Count completed videos
            completedVideos = viewLogs.filter(log => log.status === 'completed').length;
            
            // Sum watch time
            totalWatchTime = viewLogs.reduce((sum, log) => sum + (log.total_watched_time || 0), 0);
            
            // Find most recent access
            const mostRecent = viewLogs.reduce((latest, log) => 
              new Date(log.last_updated) > new Date(latest) ? log.last_updated : latest,
              viewLogs[0].last_updated
            );
            lastAccessed = mostRecent;
          }

          const progress = totalVideos > 0 
            ? Math.round((completedVideos / totalVideos) * 100)
            : 0;

          return {
            ...course,
            progress,
            completed_videos: completedVideos,
            total_videos: totalVideos,
            total_watch_time: totalWatchTime,
            last_accessed: lastAccessed,
            certificate_earned: completedVideos === totalVideos && totalVideos > 0
          };
        })
      );

      // Sort by last accessed (most recent first)
      coursesWithProgress.sort((a, b) => new Date(b.last_accessed!).getTime() - new Date(a.last_accessed!).getTime());

      // Calculate stats
      const totalCourses = coursesWithProgress.length;
      const completedCourses = coursesWithProgress.filter(c => c.progress === 100).length;
      const inProgressCourses = coursesWithProgress.filter(c => c.progress > 0 && c.progress < 100).length;
      const totalWatchTime = coursesWithProgress.reduce((sum, c) => sum + (c.total_watch_time || 0), 0);

      setCourses(coursesWithProgress);
      setStats({
        totalCourses,
        completedCourses,
        inProgressCourses,
        totalWatchTime
      });

    } catch (error) {
      console.error('マイコース取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGetCertificate = async (course: Course) => {
    // Check if course is really 100% complete
    if (course.progress !== 100) {
      alert('コースを100%完了してから証明書を取得してください。');
      return;
    }

    try {
      // APIルートを使用して証明書を生成
      const response = await fetch('/api/certificates/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user!.id,
          courseId: course.id
        })
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('証明書生成エラー:', result);
        alert(result.error || '証明書の生成に失敗しました。');
        return;
      }

      if (result.success) {
        // 証明書を取得
        const { data: certificate, error: fetchError } = await supabase
          .from('certificates')
          .select('*')
          .eq('user_id', user!.id)
          .eq('course_id', course.id)
          .single();

        if (fetchError || !certificate) {
          console.error('証明書取得エラー:', fetchError);
          alert('証明書の取得に失敗しました。');
          return;
        }

        // Generate and download PDF
        const certWithCourse = {
          ...certificate,
          courses: {
            title: course.title,
            category_id: course.category_id
          }
        };

        const userName = user?.profile?.display_name || user?.email || '受講者名';
        const company = user?.profile?.company;

        const doc = generateCertificatePDF(certWithCourse, userName, company);
        doc.save(`certificate_${certificate.id}.pdf`);

        alert('証明書をダウンロードしました！');
      } else {
        alert(result.error || '証明書の生成に失敗しました。');
      }
    } catch (error) {
      console.error('証明書取得エラー:', error);
      alert('証明書の取得に失敗しました。');
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}時間${minutes}分`;
    }
    return `${minutes}分`;
  };

  const getProgressColor = (progress: number) => {
    if (progress === 100) return 'bg-green-50 dark:bg-green-900/200';
    if (progress >= 50) return 'bg-blue-50 dark:bg-blue-900/200';
    return 'bg-yellow-50 dark:bg-yellow-900/200';
  };

  const getStatusBadge = (progress: number) => {
    if (progress === 100) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircleIcon className="h-3 w-3 mr-1" />
          完了
        </span>
      );
    }
    if (progress > 0) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          <PlayIcon className="h-3 w-3 mr-1" />
          学習中
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-neutral-900 text-gray-800 dark:text-gray-200">
        未開始
      </span>
    );
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
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">マイコース</h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              あなたが受講中・完了したコースの進捗を確認できます。
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-xl p-6 border border-gray-200 dark:border-neutral-800">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <BookOpenIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalCourses}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">受講コース</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 border border-gray-200 dark:border-neutral-800">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircleIcon className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.completedCourses}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">完了済み</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 border border-gray-200 dark:border-neutral-800">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <PlayIcon className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.inProgressCourses}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">学習中</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 border border-gray-200 dark:border-neutral-800">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <ClockIcon className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatDuration(stats.totalWatchTime)}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">総学習時間</p>
                </div>
              </div>
            </div>
          </div>

          {/* Course List */}
          {courses.length === 0 ? (
            <div className="text-center py-12">
              <BookOpenIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">割り当てられたコースはありません</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                管理者からコースが割り当てられると、ここに表示されます。
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {courses.map((course) => (
                <div key={course.id} className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6 hover:shadow-lg dark:shadow-gray-900/50 transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-4 mb-4">
                        <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                          {course.thumbnail_url ? (
                            <img
                              src={course.thumbnail_url}
                              alt={course.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                              <BookOpenIcon className="h-8 w-8 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{course.title}</h3>
                            {getStatusBadge(course.progress || 0)}
                            {course.certificate_earned && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                <TrophyIcon className="h-3 w-3 mr-1" />
                                証明書取得
                              </span>
                            )}
                          </div>
                          <p className="text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">{course.description}</p>
                          <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                            <span className="flex items-center">
                              <AcademicCapIcon className="h-4 w-4 mr-1" />
                              {course.total_videos} 動画
                            </span>
                            <span className="flex items-center">
                              <ClockIcon className="h-4 w-4 mr-1" />
                              {formatDuration(course.total_watch_time || 0)}
                            </span>
                            <span>
                              最終学習: {new Date(course.last_accessed!).toLocaleDateString('ja-JP')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between text-sm mb-2">
                          <span className="font-medium text-gray-700 dark:text-gray-300">
                            進捗: {course.completed_videos}/{course.total_videos} 動画完了
                          </span>
                          <span className="font-bold text-gray-900 dark:text-white">{course.progress}%</span>
                        </div>
                        <div className="w-3/4 bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                          <div
                            className="h-3 bg-green-500 rounded-full transition-all duration-300"
                            style={{ width: `${course.progress}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center space-x-4">
                        <Link href={`/courses/${course.id}`}>
                          <Button className="bg-blue-600 hover:bg-blue-700 flex items-center">
                            <PlayIcon className="h-4 w-4 mr-2" />
                            {course.progress === 100 ? 'もう一度見る' : '学習を続ける'}
                          </Button>
                        </Link>
                        
                        {course.progress! > 0 && (
                          <Link href={`/courses/${course.id}/progress`}>
                            <Button variant="outline" className="flex items-center">
                              <ChartBarIcon className="h-4 w-4 mr-2" />
                              進捗詳細
                            </Button>
                          </Link>
                        )}

                        {course.progress === 100 && (
                          <Button
                            variant="outline"
                            className="flex items-center text-yellow-700 border-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                            onClick={() => handleGetCertificate(course)}
                          >
                            <TrophyIcon className="h-4 w-4 mr-2" />
                            証明書を取得
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </MainLayout>
    </AuthGuard>
  );
}