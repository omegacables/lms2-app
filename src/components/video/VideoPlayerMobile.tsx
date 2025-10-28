'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  PlayIcon,
  PauseIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  CheckCircleIcon
} from '@heroicons/react/24/solid';

interface VideoPlayerMobileProps {
  videoId: string;
  videoUrl?: string;
  title?: string;
  currentPosition?: number;
  isCompleted?: boolean;
  onProgressUpdate?: (position: number, totalWatched: number, progressPercent: number, isComplete: boolean) => void;
  onError?: (error: string) => void;
}

export default function VideoPlayerMobile({
  videoId,
  videoUrl,
  title,
  currentPosition = 0,
  isCompleted = false,
  onProgressUpdate,
  onError
}: VideoPlayerMobileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // セッション管理
  const sessionStartTimeRef = useRef<number>(0);
  const lastPositionRef = useRef<number>(0);
  const watchedSegmentsRef = useRef<Array<{start: number, end: number}>>([]);

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
  const [isMobile, setIsMobile] = useState(false);

  // 進捗管理
  const [totalWatchedTime, setTotalWatchedTime] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [hasCompletedOnce, setHasCompletedOnce] = useState(isCompleted);

  // タイマー管理
  const progressSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);
  const playTimeTrackingRef = useRef<NodeJS.Timeout | null>(null);

  // 完了判定閾値
  const COMPLETION_THRESHOLD = 90;

  // モバイル検出
  useEffect(() => {
    const checkMobile = () => {
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(mobile);
    };
    checkMobile();
  }, []);

  // エラーハンドリング
  const handleError = (errorMsg: string) => {
    console.error('[VideoPlayer] Error:', errorMsg);
    setError(errorMsg);
    setIsLoading(false);
    onError?.(errorMsg);
  };

  // 実際に視聴した時間を正確に計算
  const calculateActualWatchedTime = (): number => {
    const segments = watchedSegmentsRef.current;
    if (segments.length === 0) return 0;

    // 重複を除去して合計時間を計算
    const sortedSegments = [...segments].sort((a, b) => a.start - b.start);
    let totalTime = 0;
    let lastEnd = -1;

    for (const segment of sortedSegments) {
      const start = Math.max(segment.start, lastEnd);
      const end = segment.end;
      if (end > start) {
        totalTime += (end - start);
        lastEnd = end;
      }
    }

    return totalTime;
  };

  // 進捗を保存（バックグラウンドで非同期に実行）
  const saveProgress = useCallback(() => {
    if (!videoRef.current || !onProgressUpdate) return;
    if (hasCompletedOnce) return; // 完了済みの場合はスキップ

    const currentTime = videoRef.current.currentTime;
    const videoDuration = videoRef.current.duration;

    if (videoDuration > 0 && !isNaN(currentTime) && !isNaN(videoDuration)) {
      // 実際の視聴時間を計算
      const actualWatchedTime = calculateActualWatchedTime();

      // 進捗率を計算
      const progress = Math.min(Math.round((currentTime / videoDuration) * 100), 100);
      setProgressPercent(progress);

      // 完了判定
      const isNowComplete = progress >= COMPLETION_THRESHOLD;

      if (isNowComplete && !hasCompletedOnce) {
        setHasCompletedOnce(true);
        console.log('[VideoPlayer] 動画完了', { progress, actualWatchedTime });
      }

      // 非同期で進捗を送信（動画再生に影響を与えない）
      setTimeout(() => {
        try {
          onProgressUpdate(currentTime, actualWatchedTime, progress, isNowComplete);
          console.log('[VideoPlayer] 進捗保存', {
            currentTime: currentTime.toFixed(2),
            watchedTime: actualWatchedTime.toFixed(2),
            progress,
            isComplete: isNowComplete
          });
        } catch (err) {
          console.error('[VideoPlayer] 進捗保存エラー:', err);
        }
      }, 0);
    }
  }, [onProgressUpdate, hasCompletedOnce]);

  // 定期的な進捗保存（10秒ごと）
  useEffect(() => {
    if (isPlaying && !hasCompletedOnce) {
      progressSaveTimerRef.current = setInterval(() => {
        saveProgress();
      }, 10000); // 10秒ごと

      return () => {
        if (progressSaveTimerRef.current) {
          clearInterval(progressSaveTimerRef.current);
        }
      };
    }
  }, [isPlaying, saveProgress, hasCompletedOnce]);

  // 再生時間のトラッキング
  useEffect(() => {
    if (isPlaying && videoRef.current) {
      playTimeTrackingRef.current = setInterval(() => {
        if (videoRef.current && !videoRef.current.paused) {
          const currentTime = videoRef.current.currentTime;
          const lastPosition = lastPositionRef.current;

          // 連続した再生区間を記録
          if (Math.abs(currentTime - lastPosition) < 2) {
            // シークしていない場合（2秒以内の差）
            watchedSegmentsRef.current.push({
              start: lastPosition,
              end: currentTime
            });
          }

          lastPositionRef.current = currentTime;
        }
      }, 1000); // 1秒ごと

      return () => {
        if (playTimeTrackingRef.current) {
          clearInterval(playTimeTrackingRef.current);
        }
      };
    }
  }, [isPlaying]);

  // 動画の読み込み完了時
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const videoDuration = videoRef.current.duration;
      setDuration(videoDuration);

      console.log('[VideoPlayer] メタデータ読み込み完了', {
        duration: videoDuration,
        currentPosition,
        isCompleted: hasCompletedOnce
      });

      // 前回の視聴位置から再開（完了していない場合のみ）
      if (!hasCompletedOnce && currentPosition > 0 && currentPosition < videoDuration) {
        videoRef.current.currentTime = currentPosition;
        lastPositionRef.current = currentPosition;
      } else {
        lastPositionRef.current = 0;
      }

      setIsLoading(false);
    }
  };

  // 動画データの読み込み開始
  const handleLoadStart = () => {
    console.log('[VideoPlayer] 動画読み込み開始');
    setIsLoading(true);
  };

  // 動画データの読み込み完了
  const handleCanPlay = () => {
    console.log('[VideoPlayer] 動画再生可能');
    setIsLoading(false);
  };

  // 時間の更新
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const currentTime = videoRef.current.currentTime;
      setCurrentTime(currentTime);

      // バッファリング状況の更新
      if (videoRef.current.buffered.length > 0) {
        const bufferedEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
        setBuffered(bufferedEnd);
      }

      // 進捗率の計算（表示用）
      if (videoRef.current.duration > 0) {
        const progress = Math.min(
          Math.round((currentTime / videoRef.current.duration) * 100),
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

  // タップ/クリック時の処理
  const handleContainerClick = () => {
    setShowControls(true);
    hideControlsAfterDelay();
  };

  // 動画の再生開始時
  const handlePlay = () => {
    console.log('[VideoPlayer] 再生開始');
    setIsPlaying(true);
    sessionStartTimeRef.current = Date.now();

    if (videoRef.current) {
      lastPositionRef.current = videoRef.current.currentTime;
    }

    hideControlsAfterDelay();
  };

  // 動画の一時停止時
  const handlePause = () => {
    console.log('[VideoPlayer] 一時停止');
    setIsPlaying(false);
    setShowControls(true);

    // 一時停止時に進捗を保存
    if (!hasCompletedOnce) {
      saveProgress();
    }

    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }
  };

  // シーク時
  const handleSeeked = () => {
    console.log('[VideoPlayer] シーク完了', {
      currentTime: videoRef.current?.currentTime
    });

    if (videoRef.current) {
      lastPositionRef.current = videoRef.current.currentTime;
    }
  };

  // 動画終了時
  const handleEnded = () => {
    console.log('[VideoPlayer] 再生終了');
    setIsPlaying(false);
    setShowControls(true);

    // 最終的な進捗を保存
    if (!hasCompletedOnce) {
      saveProgress();
    }

    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }
  };

  // Waiting/Stalled イベント（バッファリング）
  const handleWaiting = () => {
    console.log('[VideoPlayer] バッファリング中...');
    setIsLoading(true);
  };

  const handleStalled = () => {
    console.log('[VideoPlayer] 動画の読み込みが停滞');
  };

  const handlePlaying = () => {
    console.log('[VideoPlayer] バッファリング完了、再生中');
    setIsLoading(false);
  };

  // 再生/一時停止の切り替え
  const togglePlay = async () => {
    if (!videoRef.current) return;

    try {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        // モバイルでは明示的にplayを呼ぶ
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
      }
    } catch (error: any) {
      console.error('[VideoPlayer] 再生エラー:', error);

      // NotAllowedError の場合はユーザーに通知
      if (error.name === 'NotAllowedError') {
        handleError('動画を再生するには、画面をタップしてください');
      } else {
        handleError('動画の再生に失敗しました');
      }
    }
  };

  // ミュート切り替え
  const toggleMute = () => {
    if (videoRef.current) {
      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
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

  // シーク
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  // フルスクリーン切り替え
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        // iOS Safari の場合は動画要素自体をフルスクリーンにする
        if (videoRef.current && 'webkitEnterFullscreen' in videoRef.current) {
          (videoRef.current as any).webkitEnterFullscreen();
        } else {
          await containerRef.current.requestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('[VideoPlayer] フルスクリーンエラー:', err);
    }
  };

  // フルスクリーン変更の監視
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // コンポーネントのアンマウント時
  useEffect(() => {
    return () => {
      // 最終的な進捗を保存
      if (!hasCompletedOnce && videoRef.current) {
        saveProgress();
      }

      // タイマーをクリア
      if (progressSaveTimerRef.current) {
        clearInterval(progressSaveTimerRef.current);
      }
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
      if (playTimeTrackingRef.current) {
        clearInterval(playTimeTrackingRef.current);
      }
    };
  }, []);

  // ページを離れる前に進捗を保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!hasCompletedOnce) {
        saveProgress();
      }
    };

    // visibilitychange イベントで保存（バックグラウンドに移る時）
    const handleVisibilityChange = () => {
      if (document.hidden && !hasCompletedOnce) {
        saveProgress();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [saveProgress, hasCompletedOnce]);

  // 時間フォーマット
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === Infinity) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className="w-full aspect-video bg-gray-900 flex items-center justify-center text-white">
        <div className="text-center p-4">
          <div className="text-xl mb-2">⚠️ 動画の読み込みに失敗しました</div>
          <div className="text-sm text-gray-400">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            ページを再読み込み
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full aspect-video bg-black relative"
      onClick={handleContainerClick}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center text-white z-10 bg-black/50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
            <div>動画を読み込み中...</div>
          </div>
        </div>
      )}

      {hasCompletedOnce && (
        <div className="absolute top-4 right-4 z-10 bg-green-600 text-white px-3 py-1 rounded-full flex items-center gap-1 text-sm">
          <CheckCircleIcon className="w-4 h-4" />
          完了済み
        </div>
      )}

      {videoUrl ? (
        <>
          <video
            ref={videoRef}
            className="w-full h-full"
            preload="auto"
            playsInline
            webkit-playsinline="true"
            onLoadedMetadata={handleLoadedMetadata}
            onLoadStart={handleLoadStart}
            onCanPlay={handleCanPlay}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeeked={handleSeeked}
            onEnded={handleEnded}
            onTimeUpdate={handleTimeUpdate}
            onWaiting={handleWaiting}
            onStalled={handleStalled}
            onPlaying={handlePlaying}
            onError={(e) => {
              console.error('[VideoPlayer] Video error:', e);
              handleError('動画ファイルの再生に失敗しました');
            }}
          >
            <source src={videoUrl} type="video/mp4" />
            <source src={videoUrl} type="video/webm" />
            お使いのブラウザは動画の再生をサポートしていません。
          </video>

          {/* カスタムコントロール */}
          <div
            className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 sm:p-4 transition-opacity duration-300 ${
              showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* プログレスバー */}
            <div className="relative mb-2 sm:mb-3">
              <input
                type="range"
                min={0}
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-2 sm:h-3 bg-gray-600 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(currentTime / duration) * 100}%, #4b5563 ${(currentTime / duration) * 100}%, #4b5563 ${(buffered / duration) * 100}%, #1f2937 ${(buffered / duration) * 100}%, #1f2937 100%)`
                }}
              />
              {/* 進捗率表示 */}
              <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-black/75 px-2 py-1 rounded text-xs text-white">
                {progressPercent}%
              </div>
            </div>

            {/* コントロールボタン */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 flex-1">
                {/* 再生/一時停止ボタン */}
                <button
                  onClick={togglePlay}
                  className="text-white hover:text-blue-400 transition-colors p-1 touch-manipulation"
                >
                  {isPlaying ? (
                    <PauseIcon className="h-7 w-7 sm:h-8 sm:w-8" />
                  ) : (
                    <PlayIcon className="h-7 w-7 sm:h-8 sm:w-8" />
                  )}
                </button>

                {/* 時間表示 */}
                <div className="text-white text-xs sm:text-sm whitespace-nowrap">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>

                {/* ボリュームコントロール（PCのみ） */}
                {!isMobile && (
                  <div className="hidden sm:flex items-center gap-1">
                    <button
                      onClick={toggleMute}
                      className="text-white hover:text-blue-400 transition-colors p-1"
                    >
                      {isMuted || volume === 0 ? (
                        <SpeakerXMarkIcon className="h-5 w-5" />
                      ) : (
                        <SpeakerWaveIcon className="h-5 w-5" />
                      )}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-16 h-1 bg-gray-600 rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* モバイルでのミュートボタン */}
                {isMobile && (
                  <button
                    onClick={toggleMute}
                    className="text-white hover:text-blue-400 transition-colors p-1 touch-manipulation"
                  >
                    {isMuted ? (
                      <SpeakerXMarkIcon className="h-6 w-6" />
                    ) : (
                      <SpeakerWaveIcon className="h-6 w-6" />
                    )}
                  </button>
                )}

                {/* フルスクリーンボタン */}
                <button
                  onClick={toggleFullscreen}
                  className="text-white hover:text-blue-400 transition-colors p-1 touch-manipulation"
                  title={isFullscreen ? "全画面を終了" : "全画面表示"}
                >
                  {isFullscreen ? (
                    <ArrowsPointingInIcon className="h-6 w-6 sm:h-7 sm:w-7" />
                  ) : (
                    <ArrowsPointingOutIcon className="h-6 w-6 sm:h-7 sm:w-7" />
                  )}
                </button>
              </div>
            </div>

            {/* タイトル表示 */}
            {title && (
              <div className="mt-2">
                <h3 className="text-white text-xs sm:text-sm font-semibold truncate">{title}</h3>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white">
          <div className="text-center">
            <div className="text-xl mb-2">動画が利用できません</div>
            <div className="text-sm text-gray-400">動画URLが設定されていません</div>
          </div>
        </div>
      )}
    </div>
  );
}
