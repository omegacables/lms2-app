'use client';

import { useState, useEffect, useRef } from 'react';
import { checkAndGenerateCertificate } from '@/lib/certificate/autoGenerateCertificate';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import { useAuth } from '@/stores/auth';
import { EnhancedVideoPlayer } from '@/components/video/EnhancedVideoPlayer';
import type { Tables } from '@/lib/database/supabase';
import {
  DocumentTextIcon,
  ClipboardDocumentCheckIcon,
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  ArrowDownTrayIcon,
  PaperClipIcon,
  DocumentIcon
} from '@heroicons/react/24/outline';

type Course = Tables<'courses'>;
type Video = Tables<'videos'>;
type VideoViewLog = Tables<'video_view_logs'>;

type VideoResource = {
  id: number;
  video_id: number;
  resource_type: 'material' | 'assignment' | 'reference' | 'explanation';
  title: string;
  description?: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  file_type?: string;
  content?: string;
  display_order: number;
  is_required: boolean;
  created_at: string;
};


export default function VideoPlayerPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const courseId = parseInt(params.id as string);
  const videoId = parseInt(params.videoId as string);

  const [course, setCourse] = useState<Course | null>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [allVideos, setAllVideos] = useState<Video[]>([]);
  const [viewLog, setViewLog] = useState<VideoViewLog | null>(null);
  const [resources, setResources] = useState<VideoResource[]>([]);
  const [activeTab, setActiveTab] = useState<'description' | 'materials' | 'assignments' | 'references'>('description');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasCompletedBefore, setHasCompletedBefore] = useState(false);
  const [lastPosition, setLastPosition] = useState<number>(0);

  const sessionId = useRef<string>(crypto.randomUUID());
  const progressUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdateRef = useRef<{ position: number; videoDuration: number; progressPercent: number } | null>(null);

  // タイムスタンプを取得する関数（Supabase互換のISO 8601形式）
  const getJSTTimestamp = () => {
    return new Date().toISOString();
  };

  // ファイルダウンロード関数
  const handleDownload = async (fileUrl: string, fileName: string) => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'download';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('ダウンロードエラー:', error);
      alert('ファイルのダウンロードに失敗しました');
    }
  };

  useEffect(() => {
    if (courseId && videoId && user) {
      fetchVideoDetails();
    }
  }, [courseId, videoId, user]);

  // コンポーネントのアンマウント時に進捗を保存
  useEffect(() => {
    return () => {
      // アンマウント時（ブラウザバック、ページ遷移時）に進捗を保存
      if (pendingUpdateRef.current) {
        const { position, videoDuration, progressPercent } = pendingUpdateRef.current;
        // 同期的に保存
        saveProgressImmediately();
        console.log('コンポーネントアンマウント時に進捗を保存しました');
      }
    };
  }, []);


  const fetchVideoDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      // コース詳細を取得
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (courseError) throw courseError;
      setCourse(courseData);

      // 動画詳細を取得
      const { data: videoData, error: videoError } = await supabase
        .from('videos')
        .select('*')
        .eq('id', videoId)
        .eq('course_id', courseId)
        .single();

      if (videoError) throw videoError;
      setVideo(videoData);

      // コース内の全動画を取得
      const { data: allVideosData, error: allVideosError } = await supabase
        .from('videos')
        .select('*')
        .eq('course_id', courseId)
        .eq('status', 'active')
        .order('order_index', { ascending: true });

      if (allVideosError) throw allVideosError;
      setAllVideos(allVideosData || []);

      // 過去に完了済みのログがあるか確認
      const { data: completedLogs } = await supabase
        .from('video_view_logs')
        .select('*')
        .eq('user_id', user!.id)
        .eq('video_id', videoId)
        .eq('status', 'completed')
        .limit(1);

      // 完了済みフラグを設定
      setHasCompletedBefore((completedLogs && completedLogs.length > 0) || false);

      // 最新の視聴ログから続きの位置を取得
      const { data: latestLog } = await supabase
        .from('video_view_logs')
        .select('current_position')
        .eq('user_id', user!.id)
        .eq('video_id', videoId)
        .order('last_updated', { ascending: false })
        .limit(1)
        .single();

      // 最後の視聴位置を設定（完了済みの場合は0から開始）
      const startPosition = (completedLogs && completedLogs.length > 0) ? 0 : (latestLog?.current_position || 0);
      setLastPosition(startPosition);
      console.log('[続きから再生] 開始位置:', startPosition);

      // 新しい視聴セッション（新しいログ）を開始
      await startViewingSession();

      // リソースを取得
      try {
        const response = await fetch(`/api/videos/${videoId}/resources`);
        if (response.ok) {
          const { data: resourcesData } = await response.json();
          console.log('取得したリソース:', resourcesData);
          console.log('参考資料:', resourcesData?.filter(r => r.resource_type === 'reference'));
          console.log('課題:', resourcesData?.filter(r => r.resource_type === 'assignment'));
          setResources(resourcesData || []);
        } else {
          console.error('リソース取得失敗:', response.status, response.statusText);
        }
      } catch (err) {
        console.error('リソース取得エラー:', err);
      }

    } catch (err) {
      console.error('動画詳細取得エラー:', err);
      setError('動画の詳細情報を取得できませんでした');
    } finally {
      setLoading(false);
    }
  };

  const startViewingSession = async () => {
    if (!user || !video) {
      console.log('[セッション開始] スキップ:', { user: !!user, video: !!video });
      return;
    }

    try {
      console.log('[セッション開始] 新しいログを作成します:', {
        userId: user.id,
        videoId,
        courseId,
        sessionId: sessionId.current
      });

      // 視聴履歴として毎回新しいログを作成
      const now = getJSTTimestamp();
      const { data, error } = await supabase
        .from('video_view_logs')
        .insert({
          user_id: user.id,
          video_id: videoId,
          course_id: courseId,
          session_id: sessionId.current,
          current_position: 0,
          total_watched_time: 0,
          progress_percent: 0,
          status: 'in_progress',
          start_time: null, // 再生ボタンを押したときに設定
          last_updated: now,
        })
        .select()
        .single();

      if (error) {
        console.error('[セッション開始] 作成エラー:', error);
        alert(`視聴ログの作成に失敗しました: ${error.message}`);
      } else if (data) {
        setViewLog(data);
        console.log('[セッション開始] 成功 - ログID:', data.id);
      } else {
        console.error('[セッション開始] データが返されませんでした');
      }
    } catch (err) {
      console.error('[セッション開始] 予期しないエラー:', err);
    }
  };


  // 実際の進捗保存処理（バックグラウンドで実行）
  const saveProgressToDatabase = async (position: number, videoDuration: number, progressPercent: number) => {
    if (!user || !video || !viewLog) {
      console.log('[進捗保存] スキップ:', { user: !!user, video: !!video, viewLog: !!viewLog });
      return;
    }

    console.log('[進捗保存] 開始:', { position, progressPercent, viewLogId: viewLog.id });

    try {
      // 進捗率100%で完了判定
      const isCompleted = progressPercent >= 100;

      // 視聴時間を計算：動画時間 × 進捗率（％を小数に変換）/ 100
      // ただし、動画時間を超えないように制限
      const calculatedWatchedTime = Math.min(
        Math.floor(videoDuration * (progressPercent / 100)),
        Math.floor(videoDuration)
      );

      const now = getJSTTimestamp();
      const updateData: any = {
        session_id: sessionId.current,
        current_position: Math.round(position),
        progress_percent: progressPercent,
        total_watched_time: calculatedWatchedTime,
        status: isCompleted ? 'completed' as const : 'in_progress' as const,
        last_updated: now,
        end_time: now, // 毎回終了時刻を記録（進捗保存時、ページ離脱時）
      };

      if (isCompleted && viewLog.status !== 'completed') {
        updateData.completed_at = now;
        setHasCompletedBefore(true); // 完了フラグを更新
        console.log('動画完了を検出！ 動画ID:', videoId, '進捗:', progressPercent, '%', '視聴時間:', calculatedWatchedTime, '秒');

        // 動画完了時にコース全体の完了状態を確認
        setTimeout(async () => {
          console.log('証明書生成チェックを開始...');
          await checkCourseCompletionAndGenerateCertificate();
        }, 2000);
      }

      // 現在のセッションのログを更新
      const { error: updateError } = await supabase
        .from('video_view_logs')
        .update(updateData)
        .eq('id', viewLog.id)
        .eq('session_id', sessionId.current); // セッションIDも確認

      if (updateError) {
        console.error('[進捗保存] 更新エラー:', updateError);
        return;
      }

      console.log('[進捗保存] 成功:', { progressPercent, position });

      // ローカルステートを更新
      setViewLog({ ...viewLog, ...updateData });

      if (isCompleted) {
        console.log('視聴ログを完了状態に更新しました:', viewLog.id);
      }
    } catch (err) {
      // エラーが発生しても動画再生を妨げない
      console.error('進捗保存エラー:', err);
    }
  };

  // デバウンスされた進捗更新（動画に影響を与えない）
  const updateProgress = async (position: number, videoDuration: number, progressPercent: number) => {
    if (!user || !video) {
      console.log('[進捗更新] スキップ:', { user: !!user, video: !!video });
      return;
    }

    console.log('[進捗更新] 受信:', { position: position.toFixed(2), progressPercent: progressPercent.toFixed(2), viewLogId: viewLog?.id });

    // 最新の値を保存
    pendingUpdateRef.current = { position, videoDuration, progressPercent };

    // 既存のタイマーをクリア
    if (progressUpdateTimerRef.current) {
      clearTimeout(progressUpdateTimerRef.current);
    }

    // 500ms後に実際の保存処理を実行（デバウンス）
    progressUpdateTimerRef.current = setTimeout(() => {
      if (pendingUpdateRef.current) {
        const { position, videoDuration, progressPercent } = pendingUpdateRef.current;
        // バックグラウンドで非同期実行
        requestAnimationFrame(() => {
          saveProgressToDatabase(position, videoDuration, progressPercent);
        });
      }
    }, 500); // 500msのデバウンス（常に保存）
  };

  // 即座に進捗を保存（ブラウザバック・ページ離脱時用）
  const saveProgressImmediately = async () => {
    if (pendingUpdateRef.current && viewLog) {
      const { position, videoDuration, progressPercent } = pendingUpdateRef.current;

      // sendBeacon APIを使って確実に送信
      const now = getJSTTimestamp();
      const isCompleted = progressPercent >= (course?.completion_threshold || 95);
      const calculatedWatchedTime = Math.min(
        Math.floor(videoDuration * (progressPercent / 100)),
        Math.floor(videoDuration)
      );

      const payload = {
        user_id: user!.id,
        video_id: videoId,
        course_id: courseId,
        session_id: sessionId.current,
        current_position: Math.round(position),
        total_watched_time: calculatedWatchedTime,
        progress_percent: progressPercent,
        video_duration: videoDuration,
        status: isCompleted ? 'completed' : 'in_progress',
        start_time: viewLog.start_time || now,
        end_time: now,
        log_id: viewLog.id,
      };

      // sendBeacon を使って非同期送信（ページ離脱時でも送信が完了する）
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const beaconSent = navigator.sendBeacon('/api/videos/save-progress', blob);

      if (beaconSent) {
        console.log('sendBeaconで進捗を送信しました');
      } else {
        // sendBeaconが失敗した場合は通常の方法で保存
        console.log('sendBeacon失敗、通常の方法で保存します');
        await saveProgressToDatabase(position, videoDuration, progressPercent);
      }

      console.log('進捗を即座に保存しました');
    }
  };

  // 再生開始時のハンドラー（開始時刻を記録）
  const handlePlayStart = async () => {
    if (!user || !video || !viewLog) {
      console.log('[再生開始] スキップ:', { user: !!user, video: !!video, viewLog: !!viewLog });
      return;
    }

    try {
      const now = getJSTTimestamp();
      console.log('[再生開始] 呼び出されました:', { viewLogId: viewLog.id, currentStartTime: viewLog.start_time });

      // 開始時刻が未設定の場合のみ記録
      if (!viewLog.start_time) {
        const { error: updateError } = await supabase
          .from('video_view_logs')
          .update({
            start_time: now,
            last_updated: now,
          })
          .eq('id', viewLog.id);

        if (updateError) {
          console.error('[再生開始] 更新エラー:', updateError);
          alert(`開始時刻の記録に失敗しました: ${updateError.message}`);
          return;
        }

        setViewLog({ ...viewLog, start_time: now, last_updated: now });
        console.log('[再生開始] 成功 - 開始時刻を記録:', now);
      } else {
        console.log('[再生開始] スキップ - 既に開始時刻が設定されています:', viewLog.start_time);
      }
    } catch (err) {
      console.error('[再生開始] 予期しないエラー:', err);
    }
  };

  // コースに戻るボタンのハンドラー
  const handleBackToCourse = async () => {
    // 進捗を保存してからナビゲート
    await saveProgressImmediately();
    router.push(`/courses/${courseId}`);
  };

  const handleVideoComplete = () => {
    console.log('動画視聴完了');
    // コース完了確認と証明書生成
    checkCourseCompletionAndGenerateCertificate();
  };

  // コース完了確認と証明書自動生成
  const checkCourseCompletionAndGenerateCertificate = async () => {
    if (!user || !courseId) return;

    try {
      // コース内のすべての動画を取得
      const { data: courseVideos, error: videosError } = await supabase
        .from('videos')
        .select('id')
        .eq('course_id', courseId)
        .eq('status', 'active');

      if (videosError) {
        console.error('動画一覧取得エラー:', videosError);
        return;
      }

      const totalVideos = courseVideos?.length || 0;
      if (totalVideos === 0) return;

      // ユーザーの完了した動画を取得
      const { data: completedLogs, error: logsError } = await supabase
        .from('video_view_logs')
        .select('video_id')
        .eq('user_id', user.id)
        .eq('course_id', courseId)
        .eq('status', 'completed');

      if (logsError) {
        console.error('視聴ログ取得エラー:', logsError);
        return;
      }

      const completedVideos = completedLogs?.length || 0;
      console.log(`コース進捗: ${completedVideos}/${totalVideos}`);

      // すべての動画が完了した場合、証明書を生成
      if (completedVideos >= totalVideos) {
        console.log('コース完了を検出！証明書を生成中...');
        console.log(`コースID: ${courseId}, ユーザーID: ${user.id}`);

        const result = await checkAndGenerateCertificate(user.id, parseInt(courseId));
        console.log('証明書生成結果:', result);

        if (result.hasNewCertificate) {
          console.log('✅ 証明書が正常に生成されました:', result.certificateId);
          // ユーザーに通知
          alert('おめでとうございます！\nコースを完了し、証明書が発行されました。\n\n「証明書」ページからダウンロードできます。');
        } else {
          console.log('⚠️ 証明書はすでに存在しています');
        }
      } else {
        console.log(`コース未完了: ${completedVideos}/${totalVideos} 動画完了`);
      }
    } catch (err) {
      console.error('コース完了確認エラー:', err);
    }
  };


  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    if (minutes < 60) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getNextVideo = () => {
    const currentIndex = allVideos.findIndex(v => v.id === videoId);
    return currentIndex < allVideos.length - 1 ? allVideos[currentIndex + 1] : null;
  };

  const getPreviousVideo = () => {
    const currentIndex = allVideos.findIndex(v => v.id === videoId);
    return currentIndex > 0 ? allVideos[currentIndex - 1] : null;
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="flex justify-center items-center min-h-screen">
          <LoadingSpinner size="lg" />
        </div>
      </AuthGuard>
    );
  }

  if (error || !video || !course) {
    return (
      <AuthGuard>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <p className="text-destructive mb-4">
              {error || '動画が見つかりませんでした'}
            </p>
            <Link href={`/courses/${courseId}`}>
              <Button variant="outline">
                コースに戻る
              </Button>
            </Link>
          </div>
        </div>
      </AuthGuard>
    );
  }

  const progressPercent = viewLog?.progress_percent || 0;
  const nextVideo = getNextVideo();
  const prevVideo = getPreviousVideo();

  return (
    <AuthGuard>
      <div className="min-h-screen bg-black">
        {/* ビデオプレイヤー */}
        <div className="relative bg-black">
          <div className="aspect-video max-h-[70vh]">
            <EnhancedVideoPlayer
              videoUrl={video.file_url}
              videoId={videoId}
              title={video.title}
              currentPosition={lastPosition}
              onProgressUpdate={updateProgress}
              onComplete={handleVideoComplete}
              onBeforeUnload={saveProgressImmediately}
              onPlayStart={handlePlayStart}
              enableSkipPrevention={!isAdmin && !hasCompletedBefore} // 管理者または完了済みの場合はスキップ防止を無効化
              completionThreshold={course?.completion_threshold || 95}
              isCompleted={hasCompletedBefore}
            />
          </div>

        </div>

        {/* 動画情報とコントロール */}
        <div className="bg-background text-foreground p-6">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-3 gap-6">
              {/* 動画情報 */}
              <div className="md:col-span-2">
                <h1 className="text-2xl font-bold mb-2">{video.title}</h1>

                <div className="flex items-center gap-4 mb-4">
                  <span className="text-sm text-muted-foreground">
                    コース: {course.title}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    進捗: {progressPercent}%
                  </span>
                  <span className="text-sm text-muted-foreground">
                    時間: {formatTime(video.duration)}
                  </span>
                </div>

                {/* 進捗バー */}
                <div className="w-full bg-muted rounded-full h-2 mb-6">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                {/* タブナビゲーション */}
                <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                  <nav className="-mb-px flex space-x-8">
                    <button
                      onClick={() => setActiveTab('description')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeTab === 'description'
                          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      <DocumentTextIcon className="h-5 w-5 inline-block mr-2" />
                      説明
                    </button>
                    <button
                      onClick={() => setActiveTab('materials')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeTab === 'materials'
                          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      <PaperClipIcon className="h-5 w-5 inline-block mr-2" />
                      配布資料 {resources.filter(r => r.resource_type === 'material').length > 0 &&
                        `(${resources.filter(r => r.resource_type === 'material').length})`}
                    </button>
                    <button
                      onClick={() => setActiveTab('assignments')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeTab === 'assignments'
                          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      <ClipboardDocumentCheckIcon className="h-5 w-5 inline-block mr-2" />
                      課題 {resources.filter(r => r.resource_type === 'assignment').length > 0 &&
                        `(${resources.filter(r => r.resource_type === 'assignment').length})`}
                    </button>
                    <button
                      onClick={() => setActiveTab('references')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeTab === 'references'
                          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      <BookOpenIcon className="h-5 w-5 inline-block mr-2" />
                      参考資料 {resources.filter(r => r.resource_type === 'reference').length > 0 &&
                        `(${resources.filter(r => r.resource_type === 'reference').length})`}
                    </button>
                  </nav>
                </div>

                {/* タブコンテンツ */}
                <div className="mb-6">
                  {activeTab === 'description' && (
                    <div>
                      {video.description ? (
                        <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {video.description}
                        </p>
                      ) : (
                        <p className="text-gray-500 dark:text-gray-400 italic">
                          説明はありません
                        </p>
                      )}

                      {/* 解説セクション */}
                      {resources.filter(r => r.resource_type === 'explanation').map(resource => (
                        <div key={resource.id} className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <h4 className="font-semibold text-blue-900 dark:text-blue-400 mb-2">
                            <ChatBubbleLeftRightIcon className="h-5 w-5 inline-block mr-2" />
                            {resource.title}
                          </h4>
                          {resource.content && (
                            <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                              {resource.content}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === 'materials' && (
                    <div className="space-y-3">
                      {resources.filter(r => r.resource_type === 'material').length > 0 ? (
                        resources.filter(r => r.resource_type === 'material').map(resource => (
                          <div key={resource.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            <div className="flex items-center space-x-3">
                              <DocumentIcon className="h-6 w-6 text-gray-500" />
                              <div>
                                <h4 className="font-medium text-gray-900 dark:text-gray-100">{resource.title}</h4>
                                {resource.description && (
                                  <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-pre-wrap">{resource.description}</p>
                                )}
                              </div>
                            </div>
                            {resource.file_url && (
                              <button
                                onClick={() => handleDownload(resource.file_url, resource.file_name || resource.title)}
                                className="flex items-center px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                              >
                                <ArrowDownTrayIcon className="h-4 w-4 mr-1" />
                                ダウンロード
                              </button>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-gray-500 dark:text-gray-400 italic">配布資料はありません</p>
                      )}
                    </div>
                  )}

                  {activeTab === 'assignments' && (
                    <div className="space-y-3">
                      {resources.filter(r => r.resource_type === 'assignment').length > 0 ? (
                        resources.filter(r => r.resource_type === 'assignment').map(resource => (
                          <div key={resource.id} className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                            <div className="flex items-start space-x-3">
                              <ClipboardDocumentCheckIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-1" />
                              <div className="flex-1">
                                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                                  {resource.title}
                                  {resource.is_required && (
                                    <span className="ml-2 text-xs bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 px-2 py-0.5 rounded">必須</span>
                                  )}
                                </h4>
                                {resource.description && (
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 whitespace-pre-wrap">{resource.description}</p>
                                )}
                                {resource.content && (
                                  <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-3">
                                    {resource.content}
                                  </div>
                                )}
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => router.push('/homework')}
                                >
                                  課題を提出
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-gray-500 dark:text-gray-400 italic">課題はありません</p>
                      )}
                    </div>
                  )}

                  {activeTab === 'references' && (
                    <div className="space-y-3">
                      {resources.filter(r => r.resource_type === 'reference').length > 0 ? (
                        resources.filter(r => r.resource_type === 'reference').map(resource => (
                          <div key={resource.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            <div className="flex items-center space-x-3">
                              <BookOpenIcon className="h-6 w-6 text-gray-500" />
                              <div>
                                <h4 className="font-medium text-gray-900 dark:text-gray-100">{resource.title}</h4>
                                {resource.description && (
                                  <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-pre-wrap">{resource.description}</p>
                                )}
                              </div>
                            </div>
                            {resource.file_url && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleDownload(resource.file_url, resource.file_name || resource.title)}
                                  className="flex items-center px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                                >
                                  <ArrowDownTrayIcon className="h-4 w-4 mr-1" />
                                  ダウンロード
                                </button>
                                <a
                                  href={resource.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                                >
                                  開く
                                </a>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-gray-500 dark:text-gray-400 italic">参考資料はありません</p>
                      )}
                    </div>
                  )}
                </div>

                {/* ナビゲーションボタン */}
                <div className="flex gap-4">
                  {prevVideo && (
                    <Link href={`/courses/${courseId}/videos/${prevVideo.id}`}>
                      <Button variant="outline">
                        ← 前の動画
                      </Button>
                    </Link>
                  )}

                  <Button variant="outline" onClick={handleBackToCourse}>
                    コースに戻る
                  </Button>

                  {nextVideo && (
                    <Link href={`/courses/${courseId}/videos/${nextVideo.id}`}>
                      <Button>
                        次の動画 →
                      </Button>
                    </Link>
                  )}
                </div>
              </div>

              {/* コース内の他の動画 */}
              <div>
                <h3 className="text-lg font-semibold mb-4">このコースの動画</h3>
                <div className="space-y-2">
                  {allVideos.map((v, index) => (
                    <Link
                      key={v.id}
                      href={`/courses/${courseId}/videos/${v.id}`}
                      className={`block p-3 rounded-lg border transition-colors ${
                        v.id === videoId 
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200' 
                          : 'bg-card border-border hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">
                          {index + 1}.
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {v.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatTime(v.duration)}
                          </p>
                        </div>
                        {v.id === videoId && (
                          <div className="w-2 h-2 bg-blue-600 rounded-full" />
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}