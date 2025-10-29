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

  const sessionId = useRef<string>(crypto.randomUUID());
  const progressUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdateRef = useRef<{ position: number; videoDuration: number; progressPercent: number } | null>(null);

  // 日本時間（JST）のタイムスタンプを取得する関数
  const getJSTTimestamp = () => {
    const now = new Date();
    // 日本時間に変換（UTC+9）
    const jstOffset = 9 * 60; // 9時間を分に変換
    const localOffset = now.getTimezoneOffset(); // ローカルタイムゾーンのオフセット（分）
    const jstTime = new Date(now.getTime() + (jstOffset + localOffset) * 60 * 1000);

    // YYYY-MM-DD HH:mm:ss.SSS 形式で返す（タイムゾーン情報なし）
    const year = jstTime.getFullYear();
    const month = String(jstTime.getMonth() + 1).padStart(2, '0');
    const day = String(jstTime.getDate()).padStart(2, '0');
    const hours = String(jstTime.getHours()).padStart(2, '0');
    const minutes = String(jstTime.getMinutes()).padStart(2, '0');
    const seconds = String(jstTime.getSeconds()).padStart(2, '0');
    const milliseconds = String(jstTime.getMilliseconds()).padStart(3, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
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

      // 既存の視聴ログを取得（最新の未完了ログ、または完了済みの場合は最新のログ）
      const { data: logsData, error: logError } = await supabase
        .from('video_view_logs')
        .select('*')
        .eq('user_id', user!.id)
        .eq('video_id', videoId)
        .order('created_at', { ascending: false });

      if (logError && logError.code !== 'PGRST116') {
        console.error('視聴ログ取得エラー:', logError);
      } else if (logsData && logsData.length > 0) {
        // 未完了のログがあればそれを使用、なければ最新のログ
        const inProgressLog = logsData.find(log => log.status !== 'completed');
        setViewLog(inProgressLog || logsData[0]);
      }

      // 新しい視聴セッションを開始
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
    if (!user || !video) return;

    try {
      // まず完了済みログを確認
      const { data: completedLogs, error: completedCheckError } = await supabase
        .from('video_view_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('video_id', videoId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1);

      if (completedCheckError && completedCheckError.code !== 'PGRST116') {
        console.error('完了済みログ確認エラー:', completedCheckError);
        return;
      }

      // 既に完了済みのログがある場合は、新しいログを作成せず、表示のみに使用
      if (completedLogs && completedLogs.length > 0) {
        setViewLog(completedLogs[0]);
        console.log('既に完了済みの動画です。新しいログは作成しません:', completedLogs[0].id);
        return;
      }

      // 未完了ログを確認
      const { data: inProgressLogs, error: checkError } = await supabase
        .from('video_view_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('video_id', videoId)
        .eq('status', 'in_progress')
        .order('created_at', { ascending: false });

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('既存ログ確認エラー:', checkError);
        return;
      }

      const existingLog = inProgressLogs && inProgressLogs.length > 0 ? inProgressLogs[0] : null;

      if (existingLog) {
        // 既存の未完了ログがある場合は更新（同じ視聴セッションを継続）
        const { data, error } = await supabase
          .from('video_view_logs')
          .update({
            session_id: sessionId.current,
            status: 'in_progress',
            last_updated: getJSTTimestamp(),
          })
          .eq('id', existingLog.id)
          .select()
          .single();

        if (error) {
          console.error('視聴セッション更新エラー:', error);
        } else if (data) {
          setViewLog(data);
          console.log('既存の未完了セッションを再開しました:', data.id);
        }
      } else {
        // 未完了ログも完了済みログもない場合は新規作成
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
            start_time: now,
            last_updated: now,
          })
          .select()
          .single();

        if (error) {
          console.error('視聴セッション作成エラー:', error);
        } else if (data) {
          setViewLog(data);
          console.log('新しい視聴セッションを作成しました:', data.id);
        }
      }
    } catch (err) {
      console.error('視聴セッション開始エラー:', err);
    }
  };


  // 実際の進捗保存処理（バックグラウンドで実行）
  const saveProgressToDatabase = async (position: number, videoDuration: number, progressPercent: number) => {
    if (!user || !video) return;

    try {
      // まず完了済みのログがあるか確認
      const { data: completedLogs } = await supabase
        .from('video_view_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('video_id', videoId)
        .eq('status', 'completed')
        .limit(1);

      // 既に完了済みのログがある場合は一切記録しない
      if (completedLogs && completedLogs.length > 0) {
        console.log('[完了済み動画] 既に完了済みのため、進捗記録をスキップします。');
        return;
      }

      // 進捗率100%で記録終了
      const isCompleted = progressPercent >= 100;

      // 既存の未完了ログをキャッシュから取得または確認
      let existingLog = viewLog;

      if (!existingLog || existingLog.status === 'completed') {
        // 未完了のログを取得
        const { data: logsData } = await supabase
          .from('video_view_logs')
          .select('*')
          .eq('user_id', user.id)
          .eq('video_id', videoId)
          .neq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1);

        existingLog = logsData && logsData.length > 0 ? logsData[0] : null;
      }

      // 二重チェック：進捗率100%に達したら、それ以上記録しない
      if (existingLog && existingLog.status === 'completed') {
        console.log('すでに完了済みのログです。記録をスキップします。');
        return;
      }

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
        end_time: now, // 毎回終了時刻を記録
      };

      // 開始時刻が未設定の場合は設定
      if (existingLog && !existingLog.start_time) {
        updateData.start_time = now;
      }

      if (isCompleted && (!existingLog || existingLog?.status !== 'completed')) {
        updateData.completed_at = now;
        console.log('動画完了を検出！ 動画ID:', videoId, '進捗:', progressPercent, '%', '視聴時間:', calculatedWatchedTime, '秒');

        // 動画完了時にコース全体の完了状態を確認
        setTimeout(async () => {
          console.log('証明書生成チェックを開始...');
          await checkCourseCompletionAndGenerateCertificate();
        }, 2000);
      }

      // existingLogがある場合は更新、ない場合は新規作成
      if (existingLog) {
        await supabase
          .from('video_view_logs')
          .update(updateData)
          .eq('id', existingLog.id);

        // ローカルステートを更新
        setViewLog({ ...existingLog, ...updateData });

        if (isCompleted) {
          console.log('視聴ログを完了状態に更新しました:', existingLog.id);
        }
      } else {
        // 新規作成（通常は発生しないが、念のため）
        const insertData = {
          ...updateData,
          user_id: user.id,
          video_id: videoId,
          course_id: courseId,
          start_time: now,
        };

        const { data: newLog } = await supabase
          .from('video_view_logs')
          .insert(insertData)
          .select()
          .single();

        if (newLog) {
          setViewLog(newLog);
          console.log('新規視聴ログを作成しました:', newLog.id);
        }
      }
    } catch (err) {
      // エラーが発生しても動画再生を妨げない
      console.error('進捗保存エラー:', err);
    }
  };

  // デバウンスされた進捗更新（動画に影響を与えない）
  const updateProgress = async (position: number, videoDuration: number, progressPercent: number) => {
    if (!user || !video) return;

    // 既に完了済みの場合は進捗更新をスキップ
    if (viewLog?.status === 'completed') {
      console.log('[完了済み動画] 既に完了済みのため、進捗更新をスキップします。');
      return;
    }

    // 最新の値を保存
    pendingUpdateRef.current = { position, videoDuration, progressPercent };

    // 既存のタイマーをクリア
    if (progressUpdateTimerRef.current) {
      clearTimeout(progressUpdateTimerRef.current);
    }

    // 2秒後に実際の保存処理を実行（デバウンス）
    progressUpdateTimerRef.current = setTimeout(() => {
      if (pendingUpdateRef.current) {
        const { position, videoDuration, progressPercent } = pendingUpdateRef.current;
        // バックグラウンドで非同期実行
        requestAnimationFrame(() => {
          saveProgressToDatabase(position, videoDuration, progressPercent);
        });
      }
    }, 2000); // 2秒のデバウンス
  };

  // 即座に進捗を保存（ブラウザバック・ページ離脱時用）
  const saveProgressImmediately = async () => {
    if (pendingUpdateRef.current) {
      const { position, videoDuration, progressPercent } = pendingUpdateRef.current;
      await saveProgressToDatabase(position, videoDuration, progressPercent);
      console.log('進捗を即座に保存しました');
    }
  };

  // 再生開始時のハンドラー（開始時刻を記録）
  const handlePlayStart = async () => {
    if (!user || !video || !viewLog) return;

    try {
      const now = getJSTTimestamp();

      // 開始時刻が未設定の場合のみ記録
      if (!viewLog.start_time) {
        await supabase
          .from('video_view_logs')
          .update({
            start_time: now,
            last_updated: now,
          })
          .eq('id', viewLog.id);

        setViewLog({ ...viewLog, start_time: now, last_updated: now });
        console.log('再生開始時刻を記録しました:', now);
      }
    } catch (err) {
      console.error('開始時刻記録エラー:', err);
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
              currentPosition={viewLog?.current_position || 0}
              onProgressUpdate={updateProgress}
              onComplete={handleVideoComplete}
              onBeforeUnload={saveProgressImmediately}
              onPlayStart={handlePlayStart}
              enableSkipPrevention={!isAdmin} // 管理者の場合はスキップ防止を無効化
              completionThreshold={course?.completion_threshold || 95}
              isCompleted={viewLog?.status === 'completed'}
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