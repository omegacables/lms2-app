'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import { useAuth } from '@/stores/auth';
import type { Tables } from '@/lib/database/supabase';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  BookOpenIcon
} from '@heroicons/react/24/outline';

type Course = Tables<'courses'>;
type Video = Tables<'videos'>;
type VideoViewLog = Tables<'video_view_logs'>;

interface Chapter {
  id: string;
  title: string;
  display_order: number;
  videos?: Video[];
}

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const courseId = parseInt(params.id as string);

  const [course, setCourse] = useState<Course | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [unassignedVideos, setUnassignedVideos] = useState<Video[]>([]);
  const [viewLogs, setViewLogs] = useState<VideoViewLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [totalVideoCount, setTotalVideoCount] = useState<number>(0);

  useEffect(() => {
    if (courseId && user) {
      fetchCourseDetails();
    }
  }, [courseId, user]);

  const fetchCourseDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      // コース詳細を取得
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .eq('status', 'active')
        .single();

      if (courseError) {
        throw courseError;
      }

      setCourse(courseData);

      // 動画一覧を取得（非公開動画も含める）
      const { data: videosData, error: videosError } = await supabase
        .from('videos')
        .select('*')
        .eq('course_id', courseId)
        .order('order_index', { ascending: true });

      if (videosError) {
        throw videosError;
      }

      setVideos(videosData || []);

      // 動画総数を取得（非公開動画も含む）
      try {
        const videoCountResponse = await fetch(`/api/courses/${courseId}/video-count`);
        if (videoCountResponse.ok) {
          const { data } = await videoCountResponse.json();
          setTotalVideoCount(data.totalCount);
        } else {
          // フォールバック: クライアント側のクエリ結果を使用
          setTotalVideoCount(videosData?.length || 0);
        }
      } catch (error) {
        console.error('動画総数取得エラー:', error);
        setTotalVideoCount(videosData?.length || 0);
      }

      // 章データを取得
      try {
        const response = await fetch(`/api/courses/${courseId}/chapters`);
        if (response.ok) {
          const data = await response.json();
          setChapters(data.chapters || []);
          setUnassignedVideos(data.unassignedVideos || []);
          // 初期状態で全章を閉じる
          setExpandedChapters(new Set());
        }
      } catch (err) {
        console.error('章データ取得エラー:', err);
        // 章データが取得できなくても動画は表示する
      }

      // ユーザーの視聴ログを取得
      const { data: logsData, error: logsError } = await supabase
        .from('video_view_logs')
        .select('*')
        .eq('course_id', courseId)
        .eq('user_id', user!.id);

      if (logsError) {
        console.error('視聴ログ取得エラー:', logsError);
      } else {
        setViewLogs(logsData || []);
      }

    } catch (err) {
      console.error('コース詳細取得エラー:', err);
      setError('コースの詳細情報を取得できませんでした');
    } finally {
      setLoading(false);
    }
  };

  const getVideoProgress = (videoId: number) => {
    // 複数ログがある場合は最新のログ（last_updatedが最も新しい）を取得
    const logs = viewLogs.filter(log => log.video_id === videoId);
    if (logs.length === 0) return 0;

    const latestLog = logs.sort((a, b) =>
      new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime()
    )[0];

    return latestLog ? latestLog.progress_percent : 0;
  };

  const getVideoStatus = (videoId: number) => {
    // 複数ログがある場合は最新のログ（last_updatedが最も新しい）を取得
    const logs = viewLogs.filter(log => log.video_id === videoId);
    if (logs.length === 0) return 'not_started';

    const latestLog = logs.sort((a, b) =>
      new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime()
    )[0];

    return latestLog ? latestLog.status : 'not_started';
  };

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return '未設定';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
      return `${hours}時間${minutes}分`;
    } else if (minutes > 0) {
      return `${minutes}分${remainingSeconds}秒`;
    } else {
      return `${remainingSeconds}秒`;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'in_progress':
        return (
          <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  const calculateCourseProgress = () => {
    if (videos.length === 0) return 0;
    const totalProgress = viewLogs.reduce((sum, log) => sum + log.progress_percent, 0);
    return Math.round(totalProgress / videos.length);
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-center items-center min-h-64">
            <LoadingSpinner size="lg" />
          </div>
        </div>
      </AuthGuard>
    );
  }

  if (error || !course) {
    return (
      <AuthGuard>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <p className="text-destructive mb-4">
              {error || 'コースが見つかりませんでした'}
            </p>
            <Link href="/my-courses">
              <Button variant="outline">
                マイコースに戻る
              </Button>
            </Link>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* パンくずリスト */}
          <nav className="mb-6">
            <ol className="flex items-center space-x-2 text-sm text-muted-foreground">
              <li>
                <Link href="/dashboard" className="hover:text-foreground">
                  ダッシュボード
                </Link>
              </li>
              <li>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </li>
              <li>
                <Link href="/my-courses" className="hover:text-foreground">
                  マイコース
                </Link>
              </li>
              <li>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </li>
              <li className="text-foreground">{course.title}</li>
            </ol>
          </nav>

          {/* コースヘッダー */}
          <div className="mb-8">
            <div className="bg-card rounded-xl border border-border p-8">
              {course.thumbnail_url && (
                <div className="mb-6">
                  <img
                    src={course.thumbnail_url}
                    alt={course.title}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                </div>
              )}
              
              <h1 className="text-3xl font-bold mb-4">{course.title}</h1>
              
              {course.description && (
                <p className="text-muted-foreground mb-6 text-lg leading-relaxed">
                  {course.description}
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                {course.difficulty_level && (
                  <div className="bg-background rounded-lg p-4 border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span className="text-sm font-medium text-muted-foreground">難易度</span>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      course.difficulty_level === 'beginner' ? 'bg-green-100 text-green-800' :
                      course.difficulty_level === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {course.difficulty_level === 'beginner' ? '初級' : 
                       course.difficulty_level === 'intermediate' ? '中級' : '上級'}
                    </span>
                  </div>
                )}
                
                <div className="bg-background rounded-lg p-4 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm font-medium text-muted-foreground">動画数</span>
                  </div>
                  <span className="text-lg font-bold">{totalVideoCount}本</span>
                </div>
                
                <div className="bg-background rounded-lg p-4 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span className="text-sm font-medium text-muted-foreground">進捗</span>
                  </div>
                  <span className="text-lg font-bold">{calculateCourseProgress()}%</span>
                </div>

                <div className="bg-background rounded-lg p-4 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium text-muted-foreground">総時間</span>
                  </div>
                  <span className="text-lg font-bold">
                    {formatDuration(course.estimated_duration || videos.reduce((sum, v) => sum + (v.duration || 0), 0))}
                  </span>
                </div>
              </div>

              {/* 進捗バー */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">学習進捗</span>
                  <span className="text-muted-foreground">{calculateCourseProgress()}% 完了</span>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-300 flex items-center justify-end pr-2"
                    style={{ width: `${calculateCourseProgress()}%` }}
                  >
                    {calculateCourseProgress() > 10 && (
                      <span className="text-xs text-white font-medium">
                        {calculateCourseProgress()}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 動画一覧 */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold mb-4">レッスン一覧</h2>

            {videos.length === 0 ? (
              <div className="text-center py-8 bg-muted rounded-lg">
                <p className="text-muted-foreground">
                  このコースには動画が登録されていません
                </p>
              </div>
            ) : (
              <>
                {/* 章ごとの動画表示 */}
                {chapters.length > 0 && chapters.map((chapter, chapterIndex) => (
                  <div key={chapter.id} className="mb-6">
                    <div
                      className="flex items-center gap-2 mb-3 p-3 bg-gray-100 dark:bg-neutral-800 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-neutral-700"
                      onClick={() => {
                        setExpandedChapters(prev => {
                          const newSet = new Set(prev);
                          if (newSet.has(chapter.id)) {
                            newSet.delete(chapter.id);
                          } else {
                            newSet.add(chapter.id);
                          }
                          return newSet;
                        });
                      }}
                    >
                      {expandedChapters.has(chapter.id) ? (
                        <ChevronDownIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                      ) : (
                        <ChevronRightIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                      )}
                      <BookOpenIcon className="h-5 w-5 text-blue-500" />
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        第{chapterIndex + 1}章: {chapter.title}
                      </h3>
                      <span className="ml-auto text-sm text-gray-500 dark:text-gray-400">
                        {chapter.videos?.length || 0} 本の動画
                      </span>
                    </div>

                    {expandedChapters.has(chapter.id) && (
                      <div className="ml-8 space-y-4">
                        {chapter.videos?.map((video, videoIndex) => {
                const progress = getVideoProgress(video.id);
                const status = getVideoStatus(video.id);

                return (
                  <div
                    key={video.id}
                    className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-6 hover:shadow-lg dark:shadow-gray-900/50 hover:border-blue-300 transition-all duration-200"
                  >
                    <div className="flex items-start gap-6">
                      <div className="flex-shrink-0">
                        <div className="relative">
                          {getStatusIcon(status)}
                          <span className="absolute -top-1 -right-1 bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">
                            {videoIndex + 1}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 sm:gap-4 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white line-clamp-2">
                                {video.title}
                              </h3>
                              {video.status !== 'active' && (
                                <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded whitespace-nowrap">
                                  非公開
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground flex-wrap">
                              <div className="flex items-center gap-1">
                                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {formatDuration(video.duration)}
                              </div>
                              <div className="flex items-center gap-1">
                                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                {progress > 0 ? `${progress}% 完了` : '未開始'}
                              </div>
                            </div>
                          </div>

                          {video.status === 'active' ? (
                            <Link href={`/courses/${courseId}/videos/${video.id}`} className="flex-shrink-0">
                              <Button size="sm" className={`whitespace-nowrap text-xs sm:text-sm px-2 sm:px-4 ${
                                status === 'completed' ? 'bg-green-600 hover:bg-green-700' :
                                status === 'in_progress' ? 'bg-blue-600 hover:bg-blue-700' :
                                'bg-gray-600 hover:bg-gray-700'
                              }`}>
                                {status === 'completed' ? (
                                  <>
                                    <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    再視聴
                                  </>
                                ) : status === 'in_progress' ? (
                                  <>
                                    <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293H15M9 10v4a2 2 0 002 2h2a2 2 0 002-2v-4m-6 0V9a2 2 0 012-2h2a2 2 0 012 2v1" />
                                    </svg>
                                    続きから
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293H15" />
                                    </svg>
                                    視聴開始
                                  </>
                                )}
                              </Button>
                            </Link>
                          ) : (
                            <Button
                              size="sm"
                              disabled
                              className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-4 bg-gray-400 cursor-not-allowed"
                            >
                              非公開
                            </Button>
                          )}
                        </div>
                        
                        {video.description && (
                          <p className="text-muted-foreground text-sm mb-4 leading-relaxed break-words overflow-hidden">
                            {video.description}
                          </p>
                        )}
                        
                        {/* 進捗バー */}
                        <div className="space-y-2">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full transition-all duration-300 ${
                                progress === 100 ? 'bg-gradient-to-r from-green-500 to-green-600' :
                                progress > 0 ? 'bg-gradient-to-r from-blue-500 to-blue-600' :
                                'bg-gray-300'
                              }`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}

                {/* 章がない場合は全動画を表示 */}
                {chapters.length === 0 && videos.map((video, index) => {
                  const progress = getVideoProgress(video.id);
                  const status = getVideoStatus(video.id);

                  return (
                    <div
                      key={video.id}
                      className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-6 hover:shadow-lg dark:shadow-gray-900/50 hover:border-blue-300 transition-all duration-200"
                    >
                      <div className="flex items-start gap-6">
                        <div className="flex-shrink-0">
                          <div className="relative">
                            {getStatusIcon(status)}
                            <span className="absolute -top-1 -right-1 bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">
                              {index + 1}
                            </span>
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 sm:gap-4 mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white line-clamp-2">
                                  {video.title}
                                </h3>
                                {video.status !== 'active' && (
                                  <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded whitespace-nowrap">
                                    非公開
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground flex-wrap">
                                <div className="flex items-center gap-1">
                                  <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {formatDuration(video.duration)}
                                </div>
                                <div className="flex items-center gap-1">
                                  <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                  </svg>
                                  {progress > 0 ? `${progress}% 完了` : '未開始'}
                                </div>
                              </div>
                            </div>

                            {video.status === 'active' ? (
                              <Link href={`/courses/${courseId}/videos/${video.id}`} className="flex-shrink-0">
                                <Button size="sm" className={`whitespace-nowrap text-xs sm:text-sm px-2 sm:px-4 ${
                                  status === 'completed' ? 'bg-green-600 hover:bg-green-700' :
                                  status === 'in_progress' ? 'bg-blue-600 hover:bg-blue-700' :
                                  'bg-gray-600 hover:bg-gray-700'
                                }`}>
                                  {status === 'completed' ? (
                                    <>
                                      <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      再視聴
                                    </>
                                  ) : status === 'in_progress' ? (
                                    <>
                                      <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293H15M9 10v4a2 2 0 002 2h2a2 2 0 002-2v-4m-6 0V9a2 2 0 012-2h2a2 2 0 012 2v1" />
                                      </svg>
                                      続きから
                                    </>
                                  ) : (
                                    <>
                                      <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293H15" />
                                      </svg>
                                      視聴開始
                                    </>
                                  )}
                                </Button>
                              </Link>
                            ) : (
                              <Button
                                size="sm"
                                disabled
                                className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-4 bg-gray-400 cursor-not-allowed"
                              >
                                非公開
                              </Button>
                            )}
                          </div>

                          {video.description && (
                            <p className="text-muted-foreground text-sm mb-4 leading-relaxed break-words overflow-hidden">
                              {video.description}
                            </p>
                          )}

                          {/* 進捗バー */}
                          <div className="space-y-2">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full transition-all duration-300 ${
                                  progress === 100 ? 'bg-gradient-to-r from-green-500 to-green-600' :
                                  progress > 0 ? 'bg-gradient-to-r from-blue-500 to-blue-600' :
                                  'bg-gray-300'
                                }`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* アクションボタン */}
          <div className="mt-8 flex gap-4 justify-center">
            <Link href="/my-courses">
              <Button variant="outline">
                マイコースに戻る
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline">
                ダッシュボードに戻る
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}