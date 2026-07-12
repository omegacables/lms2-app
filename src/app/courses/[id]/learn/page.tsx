'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import VideoPlayerMobile from '@/components/video/VideoPlayerMobile';
import { CourseCertificate } from '@/components/certificate/CourseCertificate';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/database/supabase';
import { generateUUID } from '@/lib/utils/uuid';
import { useAuth } from '@/stores/auth';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  PlayCircleIcon,
  ClockIcon,
  DocumentCheckIcon
} from '@heroicons/react/24/outline';
import type { Tables } from '@/lib/database/supabase';

type Course = Tables<'courses'>;
type Video = Tables<'videos'>;
type VideoViewLog = Tables<'video_view_logs'>;
type UserProfile = Tables<'user_profiles'>;

// 完了判定閾値（90%以上で完了）
const COMPLETION_THRESHOLD = 90;

export default function CourseLearnPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const courseId = parseInt(params.id as string);

  // 動画プレーヤーへの参照
  const saveProgressRef = useRef<(() => void) | null>(null);
  // このページ表示中の視聴セッションID（動画ごとに1行を更新し続けるための識別子）
  const sessionId = useRef<string>(generateUUID());
  // 動画ID → この視聴セッションで使うログID（INSERTの乱発を防ぎ、同じ行をUPDATEする）
  const sessionLogIdRef = useRef<Record<number, number>>({});
  // 離脱時 sendBeacon 用：最後に計算した進捗ペイロード
  const lastProgressRef = useRef<any>(null);
  // sendBeacon は Authorization ヘッダを付けられないため、最新のアクセストークンを保持
  const accessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) accessTokenRef.current = data.session?.access_token ?? null;
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      accessTokenRef.current = session?.access_token ?? null;
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // コースと動画の状態
  const [course, setCourse] = useState<Course | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [viewLogs, setViewLogs] = useState<VideoViewLog[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string>('');

  // UI状態
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false);

  // 進捗状態
  const [courseProgress, setCourseProgress] = useState({
    completedVideos: 0,
    totalVideos: 0,
    totalWatchTime: 0,
    completionDate: null as Date | null,
  });

  // 初期データ取得（依存は user?.id のみ。トークン更新でuser参照が変わっても再取得しない）
  useEffect(() => {
    if (courseId && user?.id) {
      fetchCourseData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, user?.id]);

  // 現在の動画の再生URL（bucket private/public いずれでも再生可能なように署名付きURLを使用）
  useEffect(() => {
    const currentVideo = videos[currentVideoIndex];
    const fileUrl = currentVideo?.file_url;
    if (!fileUrl) {
      setPlaybackUrl('');
      return;
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const publicPrefix = `${supabaseUrl}/storage/v1/object/public/videos/`;
    const signedPrefix = `${supabaseUrl}/storage/v1/object/sign/videos/`;
    let path: string | null = null;
    if (fileUrl.startsWith(publicPrefix)) path = fileUrl.slice(publicPrefix.length);
    else if (fileUrl.startsWith(signedPrefix)) path = fileUrl.slice(signedPrefix.length).split('?')[0];
    else if (!fileUrl.startsWith('http')) path = fileUrl;

    if (!path) {
      setPlaybackUrl(fileUrl);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.storage
        .from('videos')
        .createSignedUrl(path!, 60 * 60 * 24);
      if (cancelled) return;
      if (!error && data?.signedUrl) {
        setPlaybackUrl(data.signedUrl);
      } else {
        const { data: pub } = supabase.storage.from('videos').getPublicUrl(path!);
        setPlaybackUrl(pub?.publicUrl ?? fileUrl);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videos, currentVideoIndex]);

  // 離脱時に sendBeacon で確実に進捗を送る（unload中の通常fetch/supabase呼び出しは中断されるため）
  const flushProgressBeacon = () => {
    const p = lastProgressRef.current;
    if (!p || !p.log_id) return;
    const payload = { ...p, access_token: accessTokenRef.current };
    try {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/api/videos/save-progress', blob);
    } catch (e) {
      // 失敗しても致命的ではない
    }
  };

  // ページ離脱時のログ保存（ポップアップなし）
  useEffect(() => {
    const handleBeforeUnload = () => {
      // プレーヤーに最新値を lastProgressRef へ反映させてから beacon 送信
      if (saveProgressRef.current) saveProgressRef.current();
      flushProgressBeacon();
    };
    const handlePageHide = () => {
      if (saveProgressRef.current) saveProgressRef.current();
      flushProgressBeacon();
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (saveProgressRef.current) saveProgressRef.current();
        flushProgressBeacon();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const fetchCourseData = async () => {
    if (!user) return;

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

      if (courseError) throw courseError;

      setCourse(courseData);

      // 動画一覧を取得（動画ファイルが無い「枠」動画は受講者に表示しない）
      const { data: videosData, error: videosError } = await supabase
        .from('videos')
        .select('*')
        .eq('course_id', courseId)
        .not('file_url', 'is', null)
        .order('order_index', { ascending: true });

      if (videosError) throw videosError;

      setVideos(videosData || []);

      // ユーザープロフィールを取得
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      setUserProfile(profileData);

      // 視聴ログを取得
      const { data: logsData, error: logsError } = await supabase
        .from('video_view_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('course_id', courseId);

      if (logsError) throw logsError;

      const logs = logsData || [];
      setViewLogs(logs);

      // 進捗を計算
      calculateCourseProgress(videosData || [], logs);

      // 最後に視聴していた動画、または最初の未完了動画を見つける
      const lastWatchedIndex = findStartVideoIndex(videosData || [], logs);
      setCurrentVideoIndex(lastWatchedIndex);

    } catch (err) {
      console.error('Error fetching course data:', err);
      setError('コースデータの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 開始する動画を見つける
  const findStartVideoIndex = (videos: Video[], logs: VideoViewLog[]): number => {
    // ✅ 各動画の最新ログを使って未完了の最初の動画を探す
    for (let i = 0; i < videos.length; i++) {
      const videoLogs = logs.filter(l => l.video_id === videos[i].id);
      const latestLog = videoLogs.length > 0
        ? videoLogs.reduce((latest, current) =>
            new Date(current.end_time || current.start_time) > new Date(latest.end_time || latest.start_time)
              ? current
              : latest
          )
        : null;

      if (!latestLog || (latestLog.progress_percent || 0) < COMPLETION_THRESHOLD) {
        return i;
      }
    }
    // すべて完了している場合は最初の動画
    return 0;
  };

  // コース全体の進捗を計算
  const calculateCourseProgress = (videos: Video[], logs: VideoViewLog[]) => {
    // ✅ 各動画の最新ログのみを使って計算
    const latestLogsPerVideo = new Map<number, VideoViewLog>();

    logs.forEach(log => {
      const existing = latestLogsPerVideo.get(log.video_id);
      if (!existing ||
          new Date(log.end_time || log.start_time) > new Date(existing.end_time || existing.start_time)) {
        latestLogsPerVideo.set(log.video_id, log);
      }
    });

    const latestLogs = Array.from(latestLogsPerVideo.values());

    const completedVideos = latestLogs.filter(
      log => (log.progress_percent || 0) >= COMPLETION_THRESHOLD
    ).length;

    const totalWatchTime = latestLogs.reduce(
      (sum, log) => sum + (log.total_watched_time || 0),
      0
    );

    // すべての動画が完了したか
    const isCompleted = videos.length > 0 && completedVideos === videos.length;

    // 完了日を取得（最後の動画の完了日）
    let completionDate: Date | null = null;
    if (isCompleted) {
      const completedLatestLogs = latestLogs
        .filter(log => (log.progress_percent || 0) >= COMPLETION_THRESHOLD)
        .sort((a, b) => new Date(b.updated_at || b.end_time).getTime() - new Date(a.updated_at || a.end_time).getTime());

      if (completedLatestLogs.length > 0) {
        completionDate = new Date(completedLatestLogs[0].updated_at || completedLatestLogs[0].end_time);
      }
    }

    setCourseProgress({
      completedVideos,
      totalVideos: videos.length,
      totalWatchTime,
      completionDate,
    });

    // すべて完了したら証明書セクションを表示
    if (isCompleted) {
      setShowCertificate(true);
    }
  };

  // 動画の進捗更新
  const handleProgressUpdate = useCallback(async (
    position: number,
    totalWatched: number,
    progressPercent: number,
    isComplete: boolean
  ) => {
    console.log('[Learn] 📥 handleProgressUpdate 呼び出し', {
      position: position.toFixed(2),
      totalWatched: totalWatched.toFixed(2),
      progressPercent,
      isComplete
    });

    if (!user || !videos[currentVideoIndex] || isSaving) {
      console.log('[Learn] ⚠️ 保存条件を満たさず', { user: !!user, hasVideo: !!videos[currentVideoIndex], isSaving });
      return;
    }

    const currentVideo = videos[currentVideoIndex];

    // 既存のログを確認（完了済みかどうかチェック用）
    const existingLogs = viewLogs.filter(log => log.video_id === currentVideo.id);
    const latestLog = existingLogs.length > 0
      ? existingLogs.reduce((latest, current) =>
          new Date(current.end_time || current.start_time) > new Date(latest.end_time || latest.start_time)
            ? current
            : latest
        )
      : null;

    // ✅ 100%完了済みの場合は一切ログを保存しない
    const wasCompleted = latestLog && (latestLog.progress_percent || 0) >= COMPLETION_THRESHOLD;
    if (wasCompleted) {
      console.log('[Learn] ⛔ 100%完了済み - ログ保存をスキップ', {
        videoId: currentVideo.id,
        latestProgress: latestLog?.progress_percent
      });
      return;
    }

    // 離脱時 beacon 用に、最新の進捗を常に控えておく（この動画のセッションログIDに紐付け）
    lastProgressRef.current = {
      log_id: sessionLogIdRef.current[currentVideo.id] ?? undefined,
      video_id: currentVideo.id,
      course_id: courseId,
      session_id: sessionId.current,
      current_position: Math.round(position),
      total_watched_time: totalWatched,
      progress_percent: progressPercent,
      status: isComplete ? 'completed' : 'in_progress',
      end_time: new Date().toISOString(),
    };

    setIsSaving(true);

    try {
      const now = new Date().toISOString();
      const existingLogId = sessionLogIdRef.current[currentVideo.id];

      // この視聴セッションで既に行があれば UPDATE（無ければ INSERT）
      // → 保存のたびに行が増える問題を解消し、1セッション1行に集約
      if (existingLogId) {
        const currentProgress = latestLog?.progress_percent || 0;
        const nextProgress = Math.max(progressPercent, currentProgress);
        const { data, error } = await supabase
          .from('video_view_logs')
          .update({
            current_position: position,
            total_watched_time: totalWatched,
            progress_percent: nextProgress,
            completed_at: isComplete ? now : null,
            status: isComplete ? 'completed' : 'in_progress',
            end_time: now,
            last_updated: now,
          })
          .eq('id', existingLogId)
          .eq('user_id', user.id)
          .select()
          .single();
        if (error) throw error;
        setViewLogs(prev => prev.map(l => (l.id === existingLogId ? data : l)));
      } else {
        const insertData = {
          user_id: user.id,
          course_id: courseId,
          video_id: currentVideo.id,
          session_id: sessionId.current,
          current_position: position,
          total_watched_time: totalWatched,
          progress_percent: progressPercent,
          completed_at: isComplete ? now : null,
          status: isComplete ? 'completed' : 'in_progress',
          start_time: now,
          end_time: now,
          last_updated: now,
        };
        const { data, error } = await supabase
          .from('video_view_logs')
          .insert(insertData)
          .select()
          .single();
        if (error) throw error;
        sessionLogIdRef.current[currentVideo.id] = data.id;
        lastProgressRef.current.log_id = data.id;
        setViewLogs(prev => [...prev, data]);
      }

      // 動画が完了し、次の動画がある場合は自動的に次へ
      if (isComplete && currentVideoIndex < videos.length - 1) {
        setTimeout(() => {
          handleNextVideo();
        }, 2000);
      }
    } catch (err) {
      console.error('Error updating progress:', err);
    } finally {
      setIsSaving(false);
    }
  }, [user, videos, currentVideoIndex, viewLogs, courseId, isSaving]);

  // 進捗リセット
  const handleResetProgress = async () => {
    if (!user || !videos[currentVideoIndex]) return;

    const currentVideo = videos[currentVideoIndex];
    const existingLog = viewLogs.find(log => log.video_id === currentVideo.id);

    if (!existingLog) return;

    try {
      // ログをリセット
      const { data, error } = await supabase
        .from('video_view_logs')
        .update({
          current_position: 0,
          total_watched_time: 0,
          progress_percent: 0,
          completed_at: null,
          end_time: null,
          last_updated: new Date().toISOString(),
        })
        .eq('id', existingLog.id)
        .select()
        .single();

      if (error) throw error;

      // ローカル状態を更新
      setViewLogs(prev => prev.map(log =>
        log.id === existingLog.id ? data : log
      ));

      // 進捗を再計算
      calculateCourseProgress(videos, viewLogs.map(log =>
        log.id === existingLog.id ? data : log
      ));

    } catch (err) {
      console.error('Error resetting progress:', err);
    }
  };

  // 次の動画へ
  const handleNextVideo = () => {
    if (currentVideoIndex < videos.length - 1) {
      setCurrentVideoIndex(currentVideoIndex + 1);
    }
  };

  // 前の動画へ
  const handlePreviousVideo = () => {
    if (currentVideoIndex > 0) {
      setCurrentVideoIndex(currentVideoIndex - 1);
    }
  };

  // 特定の動画へジャンプ
  const handleSelectVideo = (index: number) => {
    setCurrentVideoIndex(index);
  };

  // 動画が切り替わった時のログは、VideoPlayerMobileコンポーネントで自動的に記録される
  // このuseEffectは不要（削除）

  // 動画の状態を取得
  const getVideoStatus = (video: Video): '未受講' | '受講中' | '受講完了' => {
    const log = viewLogs.find(l => l.video_id === video.id);
    if (!log) return '未受講';
    if ((log.progress_percent || 0) >= COMPLETION_THRESHOLD) return '受講完了';
    return '受講中';
  };

  if (loading) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="flex justify-center items-center min-h-screen">
            <LoadingSpinner size="lg" />
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  if (error || !course || videos.length === 0) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="container mx-auto px-4 py-8">
            <div className="text-center">
              <p className="text-red-600 mb-4">{error || 'コースが見つかりません'}</p>
              <Button onClick={() => router.push('/courses')}>
                コース一覧に戻る
              </Button>
            </div>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  const currentVideo = videos[currentVideoIndex];

  // ✅ 現在の動画の最新のログを取得（同じ動画の複数ログから最新のものを選ぶ）
  const currentVideoLogs = viewLogs.filter(log => log.video_id === currentVideo?.id);
  const currentVideoLog = currentVideoLogs.length > 0
    ? currentVideoLogs.reduce((latest, current) =>
        new Date(current.end_time || current.start_time) > new Date(latest.end_time || latest.start_time)
          ? current
          : latest
      )
    : undefined;

  return (
    <AuthGuard>
      <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* ヘッダー */}
        <div className="bg-white dark:bg-gray-800 shadow-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    console.log('[Learn] 🚪 コース詳細に戻る - 進捗保存');
                    // 必ず進捗を保存
                    if (saveProgressRef.current) {
                      console.log('[Learn] 💾 進捗保存を実行');
                      saveProgressRef.current();
                    }
                    // 少し待ってからページ遷移（保存を確実に完了させる）
                    setTimeout(() => {
                      router.push(`/courses/${courseId}`);
                    }, 500);
                  }}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  ← コース詳細に戻る
                </button>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  {course.title}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  進捗: {courseProgress.completedVideos}/{courseProgress.totalVideos} 完了
                </span>
                {showCertificate && (
                  <DocumentCheckIcon className="w-5 h-5 text-green-600" />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
          <div className="flex flex-col lg:grid lg:grid-cols-4 gap-4 lg:gap-6">
            {/* メインコンテンツ - 動画プレーヤー（モバイルで最初に表示） */}
            <div className="lg:col-span-3 order-1">
              {currentVideo && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                  {/* 動画タイトル */}
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {currentVideo.title}
                    </h2>
                    {currentVideo.description && (
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        {currentVideo.description}
                      </p>
                    )}
                  </div>

                  {/* 動画プレーヤー */}
                  <div className="p-0 sm:p-4">
                    <VideoPlayerMobile
                      videoId={currentVideo.id.toString()}
                      videoUrl={playbackUrl || undefined}
                      title={currentVideo.title}
                      currentPosition={currentVideoLog?.current_position || 0}
                      isCompleted={(currentVideoLog?.progress_percent || 0) >= COMPLETION_THRESHOLD}
                      canSkip={isAdmin || user?.profile?.can_skip_videos === true}
                      onProgressUpdate={handleProgressUpdate}
                      onError={(error) => console.error('Video error:', error)}
                      onSaveProgressRef={saveProgressRef}
                    />
                  </div>

                  {/* ナビゲーションボタン */}
                  <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-center">
                      <Button
                        variant="outline"
                        onClick={handlePreviousVideo}
                        disabled={currentVideoIndex === 0}
                        className="flex items-center gap-2"
                      >
                        <ChevronLeftIcon className="w-4 h-4" />
                        前の動画
                      </Button>

                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {currentVideoIndex + 1} / {videos.length}
                      </span>

                      <Button
                        variant="outline"
                        onClick={handleNextVideo}
                        disabled={currentVideoIndex === videos.length - 1}
                        className="flex items-center gap-2"
                      >
                        次の動画
                        <ChevronRightIcon className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* サイドバー - 動画リスト（モバイルで2番目に表示） */}
            <div className="lg:col-span-1 order-2">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-4">
                  動画一覧 ({videos.length}件)
                </h2>
                <div className="space-y-2 max-h-[400px] sm:max-h-[600px] lg:max-h-[70vh] overflow-y-auto pr-2"
                     style={{scrollbarWidth: 'thin'}}>
                  {videos.map((video, index) => {
                    const status = getVideoStatus(video);
                    const isActive = index === currentVideoIndex;

                    return (
                      <button
                        key={video.id}
                        onClick={() => handleSelectVideo(index)}
                        className={`w-full text-left p-3 rounded-lg transition-colors ${
                          isActive
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-600'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-1">
                            {status === '受講完了' ? (
                              <CheckCircleIcon className="w-5 h-5 text-green-600" />
                            ) : status === '受講中' ? (
                              <ClockIcon className="w-5 h-5 text-yellow-600" />
                            ) : (
                              <PlayCircleIcon className="w-5 h-5 text-gray-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${
                              isActive
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-gray-900 dark:text-white'
                            }`}>
                              {index + 1}. {video.title}
                            </p>
                            {video.duration && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {Math.floor(video.duration / 60)}分
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 修了証セクション */}
              {showCertificate && userProfile && (
                <div className="mt-6">
                  <CourseCertificate
                    course={course}
                    user={userProfile}
                    completionDate={courseProgress.completionDate || new Date()}
                    progress={courseProgress}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </MainLayout>
    </AuthGuard>
  );
}