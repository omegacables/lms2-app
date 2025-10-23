'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  PlayIcon,
  PauseIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  ArrowPathIcon,
  CheckCircleIcon
} from '@heroicons/react/24/solid';
import { debounce } from '@/lib/utils';

interface VideoPlayerOptimizedProps {
  videoId: string;
  videoUrl?: string;
  title?: string;
  currentPosition?: number;
  isCompleted?: boolean;
  onProgressUpdate?: (position: number, totalWatched: number, progressPercent: number, isComplete: boolean) => void;
  onResetProgress?: () => void;
  onError?: (error: string) => void;
}

export default function VideoPlayerOptimized({
  videoId,
  videoUrl,
  title,
  currentPosition = 0,
  isCompleted = false,
  onProgressUpdate,
  onResetProgress,
  onError
}: VideoPlayerOptimizedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ステータス管理
  const [status, setStatus] = useState<'未受講' | '受講中' | '受講完了'>(
    isCompleted ? '受講完了' : currentPosition > 0 ? '受講中' : '未受講'
  );

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [buffered, setBuffered] = useState(0);

  // 進捗管理
  const [totalWatchedTime, setTotalWatchedTime] = useState(0);
  const [lastUpdateTime, setLastUpdateTime] = useState(0);
  const [hasCompletedOnce, setHasCompletedOnce] = useState(isCompleted);
  const [progressPercent, setProgressPercent] = useState(0);

  // タイマー管理
  const progressUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);

  // 完了判定閾値（90%以上で完了とする）
  const COMPLETION_THRESHOLD = 90;

  // 進捗更新間隔（15秒に延長して負荷軽減）
  const PROGRESS_UPDATE_INTERVAL = 15000;

  // エラーハンドリング
  const handleError = (errorMsg: string) => {
    setError(errorMsg);
    setIsLoading(false);
    onError?.(errorMsg);
  };

  // デバウンスされた進捗更新（頻繁な更新を防ぐ）
  const debouncedProgressUpdate = useCallback(
    debounce((currentTime: number, totalWatched: number, progress: number) => {
      if (!onProgressUpdate) return;

      // 既に完了している場合は、再視聴として扱い、進捗を更新しない
      if (hasCompletedOnce && status === '受講完了') {
        console.log('[VideoPlayer] 既に完了済み。進捗更新をスキップ');
        return;
      }

      // 完了判定
      const isNowComplete = progress >= COMPLETION_THRESHOLD;

      // 初めて完了した場合
      if (isNowComplete && !hasCompletedOnce) {
        setHasCompletedOnce(true);
        setStatus('受講完了');
      } else if (!isNowComplete && !hasCompletedOnce) {
        setStatus('受講中');
      }

      onProgressUpdate(currentTime, totalWatched, progress, isNowComplete);
    }, 1000),
    [hasCompletedOnce, status, onProgressUpdate]
  );

  // 動画の読み込み完了時
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const videoDuration = videoRef.current.duration;
      setDuration(videoDuration);

      // 前回の視聴位置から再開（完了していない場合のみ）
      if (!hasCompletedOnce && currentPosition > 0 && currentPosition < videoDuration) {
        videoRef.current.currentTime = currentPosition;
      }

      setIsLoading(false);
    }
  };

  // 進捗更新処理（最適化版）
  const updateProgress = useCallback(() => {
    if (!videoRef.current) return;

    const currentTime = videoRef.current.currentTime;
    const videoDuration = videoRef.current.duration;

    if (videoDuration > 0) {
      const progress = Math.min(Math.round((currentTime / videoDuration) * 100), 100);
      setProgressPercent(progress);

      // 視聴時間の累計計算
      const now = Date.now();
      if (lastUpdateTime > 0 && !videoRef.current.paused) {
        const elapsed = (now - lastUpdateTime) / 1000;
        setTotalWatchedTime(prev => prev + elapsed);
      }
      setLastUpdateTime(now);

      // デバウンスされた更新を呼び出し
      debouncedProgressUpdate(currentTime, totalWatchedTime, progress);
    }
  }, [lastUpdateTime, totalWatchedTime, debouncedProgressUpdate]);

  // 時間の更新（UI更新のみ、進捗送信はしない）
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);

      // バッファリング状況の更新
      if (videoRef.current.buffered.length > 0) {
        const bufferedEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
        setBuffered(bufferedEnd);
      }

      // 進捗率の計算（表示用）
      if (videoRef.current.duration > 0) {
        const progress = Math.min(
          Math.round((videoRef.current.currentTime / videoRef.current.duration) * 100),
          100
        );
        setProgressPercent(progress);
      }
    }
  };

  // コントロールを自動的に非表示にする
  const hideControlsAfterDelay = () => {
    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }

    hideControlsTimer.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  };

  // マウス移動時の処理
  const handleMouseMove = () => {
    setShowControls(true);
    hideControlsAfterDelay();
  };

  // マウスが離れた時の処理
  const handleMouseLeave = () => {
    if (isPlaying) {
      hideControlsAfterDelay();
    }
  };

  // 動画の再生開始時
  const handlePlay = () => {
    setLastUpdateTime(Date.now());
    setIsPlaying(true);
    hideControlsAfterDelay();

    // 長い間隔で進捗を更新（負荷軽減）
    if (!progressUpdateRef.current) {
      progressUpdateRef.current = setInterval(updateProgress, PROGRESS_UPDATE_INTERVAL);
    }
  };

  // 動画の一時停止時
  const handlePause = () => {
    updateProgress(); // 最終的な進捗を更新
    setIsPlaying(false);
    setShowControls(true);

    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }

    if (progressUpdateRef.current) {
      clearInterval(progressUpdateRef.current);
      progressUpdateRef.current = null;
    }
  };

  // 動画終了時
  const handleEnded = () => {
    updateProgress();
    setIsPlaying(false);
    setShowControls(true);

    if (progressUpdateRef.current) {
      clearInterval(progressUpdateRef.current);
      progressUpdateRef.current = null;
    }
  };

  // 進捗リセット機能
  const handleResetProgress = async () => {
    if (!confirm('この動画の進捗をリセットしますか？最初から視聴し直すことになります。')) {
      return;
    }

    // ローカル状態をリセット
    setHasCompletedOnce(false);
    setStatus('未受講');
    setTotalWatchedTime(0);
    setProgressPercent(0);

    // 動画を最初に戻す
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }

    // 親コンポーネントに通知
    onResetProgress?.();
  };

  // 再生/一時停止の切り替え
  const togglePlay = async () => {
    if (videoRef.current) {
      try {
        if (isPlaying) {
          videoRef.current.pause();
        } else {
          await videoRef.current.play();
        }
      } catch (error) {
        console.error('Playback error:', error);
        handleError('動画の再生に失敗しました');
      }
    }
  };

  // ボリューム調整
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setVolume(value);
    if (videoRef.current) {
      videoRef.current.volume = value;
      setIsMuted(value === 0);
    }
  };

  // ミュート切り替え
  const toggleMute = () => {
    if (videoRef.current) {
      if (isMuted) {
        videoRef.current.volume = volume;
        setIsMuted(false);
      } else {
        videoRef.current.volume = 0;
        setIsMuted(true);
      }
    }
  };

  // シーク処理
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = value;
      setCurrentTime(value);
    }
  };

  // フルスクリーン切り替え（モバイル対応）
  const toggleFullscreen = async () => {
    if (!videoRef.current) return;

    try {
      const video = videoRef.current as any;

      // フルスクリーン状態の確認（各ブラウザ対応）
      const isInFullscreen =
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement;

      if (!isInFullscreen) {
        // フルスクリーン化（各ブラウザのAPIを順に試行）
        if (video.requestFullscreen) {
          await video.requestFullscreen();
        } else if (video.webkitRequestFullscreen) {
          await video.webkitRequestFullscreen(); // Safari iOS
        } else if (video.webkitEnterFullscreen) {
          video.webkitEnterFullscreen(); // 古いiOS Safari
        } else if (video.mozRequestFullScreen) {
          await video.mozRequestFullScreen(); // Firefox
        } else if (video.msRequestFullscreen) {
          await video.msRequestFullscreen(); // IE/Edge
        }
        setIsFullscreen(true);
      } else {
        // フルスクリーン解除
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  };

  // フルスクリーン状態の監視
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isInFullscreen =
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement;

      setIsFullscreen(!!isInFullscreen);
    };

    // 各ブラウザのフルスクリーン変更イベントを監視
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (progressUpdateRef.current) {
        clearInterval(progressUpdateRef.current);
      }
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };
  }, []);

  // 時間フォーマット
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // ステータスバッジの表示
  const getStatusBadge = () => {
    const statusConfig = {
      '未受講': { color: 'bg-gray-500', icon: null },
      '受講中': { color: 'bg-yellow-500', icon: null },
      '受講完了': { color: 'bg-green-500', icon: CheckCircleIcon }
    };

    const config = statusConfig[status];

    return (
      <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-white text-xs ${config.color}`}>
        {config.icon && <config.icon className="w-3 h-3" />}
        {status}
      </div>
    );
  };

  if (error) {
    return (
      <div className="bg-gray-900 rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
        <div className="w-full h-full flex items-center justify-center p-8">
          <div className="text-center">
            <p className="text-red-500 mb-2">動画の読み込みに失敗しました</p>
            <p className="text-gray-400 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-black rounded-lg overflow-hidden">
      {/* ステータスとリセットボタン */}
      <div className="absolute top-2 left-2 right-2 flex justify-between items-center z-20">
        {getStatusBadge()}
        {status === '受講中' && !hasCompletedOnce && (
          <button
            onClick={handleResetProgress}
            className="flex items-center gap-1 px-2 py-1 bg-gray-800 text-white text-xs rounded hover:bg-gray-700 transition-colors"
            title="進捗をリセット"
          >
            <ArrowPathIcon className="w-3 h-3" />
            リセット
          </button>
        )}
      </div>

      {/* アスペクト比を維持するコンテナ（16:9） */}
      <div
        ref={containerRef}
        className="relative w-full"
        style={{ aspectRatio: '16/9' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* ビデオ要素 */}
        <video
          ref={videoRef}
          src={videoUrl}
          className="absolute inset-0 w-full h-full object-contain"
          playsInline
          preload="metadata"
          controlsList="nodownload"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onError={() => handleError('動画の読み込みに失敗しました')}
          onWaiting={() => console.log('動画バッファリング中...')}
          onCanPlay={() => console.log('動画再生可能')}
          onStalled={() => console.error('動画読み込みが停止しました')}
        />

        {/* ローディング表示 */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div className="text-white">読み込み中...</div>
          </div>
        )}

        {/* コントロール */}
        <div
          className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* プログレスバー */}
          <div className="mb-2">
            <div className="relative">
              {/* バッファリング表示 */}
              <div className="absolute h-1 bg-gray-600 rounded-full" style={{ width: '100%' }} />
              <div
                className="absolute h-1 bg-gray-400 rounded-full"
                style={{ width: `${(buffered / duration) * 100}%` }}
              />
              {/* 進捗表示 */}
              <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1 bg-transparent appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer relative z-10"
              />
              {/* 進捗パーセンテージ表示 */}
              <div className="absolute -top-6 left-0 text-white text-xs">
                {progressPercent}%
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* 再生/一時停止 */}
              <button
                onClick={togglePlay}
                className="text-white hover:text-gray-300 transition-colors"
              >
                {isPlaying ? (
                  <PauseIcon className="w-8 h-8" />
                ) : (
                  <PlayIcon className="w-8 h-8" />
                )}
              </button>

              {/* ボリュームコントロール */}
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className="text-white hover:text-gray-300 transition-colors"
                >
                  {isMuted ? (
                    <SpeakerXMarkIcon className="w-6 h-6" />
                  ) : (
                    <SpeakerWaveIcon className="w-6 h-6" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1 bg-gray-600 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                />
              </div>

              {/* 時間表示 */}
              <div className="text-white text-sm">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>

            {/* フルスクリーン */}
            <button
              onClick={toggleFullscreen}
              className="text-white hover:text-gray-300 transition-colors"
            >
              {isFullscreen ? (
                <ArrowsPointingInIcon className="w-6 h-6" />
              ) : (
                <ArrowsPointingOutIcon className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}