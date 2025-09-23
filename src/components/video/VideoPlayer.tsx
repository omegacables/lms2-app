'use client';

import React, { useRef, useEffect, useState } from 'react';
import {
  PlayIcon,
  PauseIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon
} from '@heroicons/react/24/solid';

interface VideoPlayerProps {
  videoId: string;
  videoUrl?: string;
  title?: string;
  currentPosition?: number;
  isCompleted?: boolean;
  onProgressUpdate?: (position: number, totalWatched: number, progressPercent: number) => void;
  onError?: (error: string) => void;
}

export default function VideoPlayer({
  videoId,
  videoUrl,
  title,
  currentPosition = 0,
  isCompleted = false,
  onProgressUpdate,
  onError
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalWatchedTime, setTotalWatchedTime] = useState(0);
  const [lastUpdateTime, setLastUpdateTime] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const progressUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);

  // エラーハンドリング
  const handleError = (errorMsg: string) => {
    setError(errorMsg);
    setIsLoading(false);
    onError?.(errorMsg);
  };

  // 動画の読み込み完了時
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const videoDuration = videoRef.current.duration;
      setDuration(videoDuration);

      // 前回の視聴位置から再開
      if (currentPosition > 0 && currentPosition < videoDuration) {
        videoRef.current.currentTime = currentPosition;
      }

      setIsLoading(false);
    }
  };

  // 進捗更新処理
  const updateProgress = () => {
    if (!videoRef.current || !onProgressUpdate) return;

    const currentTime = videoRef.current.currentTime;
    const videoDuration = videoRef.current.duration;

    if (videoDuration > 0) {
      const progressPercent = Math.min(Math.round((currentTime / videoDuration) * 100), 100);

      // 視聴時間の累計計算（前回の更新から経過した時間を追加）
      const now = Date.now();
      if (lastUpdateTime > 0 && !videoRef.current.paused) {
        const elapsed = (now - lastUpdateTime) / 1000; // 秒に変換
        setTotalWatchedTime(prev => prev + elapsed);
      }
      setLastUpdateTime(now);

      // 進捗をサーバーに送信
      onProgressUpdate(currentTime, totalWatchedTime, progressPercent);
    }
  };

  // 時間の更新
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);

      // バッファリング状況の更新
      if (videoRef.current.buffered.length > 0) {
        const bufferedEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
        setBuffered(bufferedEnd);
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
    }, 3000); // 3秒後に非表示
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

    // 5秒ごとに進捗を更新
    progressUpdateRef.current = setInterval(updateProgress, 5000);
  };

  // 動画の一時停止時
  const handlePause = () => {
    updateProgress(); // 最終的な進捗を更新
    setIsPlaying(false);
    setShowControls(true); // 一時停止時はコントロールを表示

    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }

    if (progressUpdateRef.current) {
      clearInterval(progressUpdateRef.current);
      progressUpdateRef.current = null;
    }
  };

  // 動画のシーク時
  const handleSeeked = () => {
    updateProgress();
  };

  // 動画終了時
  const handleEnded = () => {
    updateProgress();
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

  // 再生/一時停止の切り替え
  const togglePlay = async () => {
    if (videoRef.current) {
      try {
        if (isPlaying) {
          videoRef.current.pause();
        } else {
          // 再生を試みる前に、既存の再生を停止
          videoRef.current.pause();
          // 少し待ってから再生
          await new Promise(resolve => setTimeout(resolve, 100));
          await videoRef.current.play();
        }
      } catch (error) {
        console.error('Playback error:', error);
        // エラーが発生した場合は、再度試みる
        if (!isPlaying && videoRef.current) {
          try {
            await videoRef.current.play();
          } catch (retryError) {
            console.error('Retry playback error:', retryError);
            handleError('動画の再生に失敗しました。ページを再読み込みしてください。');
          }
        }
      }
    }
  };

  // ミュート切り替え
  const toggleMute = () => {
    if (videoRef.current) {
      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
      if (!newMuted && volume === 0) {
        setVolume(1);
        videoRef.current.volume = 1;
      }
    }
  };

  // ボリューム変更
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      setIsMuted(newVolume === 0);
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
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  // フルスクリーン変更の監視
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // コンポーネントのアンマウント時
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

  // 動画URLが変更された時の処理
  useEffect(() => {
    if (videoUrl && videoRef.current) {
      setIsLoading(true);
      setError(null);
      setTotalWatchedTime(0);
      setLastUpdateTime(0);
    }
  }, [videoUrl]);

  // 時間フォーマット
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className="w-full aspect-video bg-gray-900 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-xl mb-2">⚠️ 動画の読み込みに失敗しました</div>
          <div className="text-sm text-gray-400">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full aspect-video bg-black relative group"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center text-white z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
            <div>動画を読み込み中...</div>
          </div>
        </div>
      )}

      {videoUrl ? (
        <>
          <video
            ref={videoRef}
            className={`w-full h-full transition-all duration-300 ${!showControls && isPlaying ? 'cursor-none' : ''}`}
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeeked={handleSeeked}
            onEnded={handleEnded}
            onTimeUpdate={handleTimeUpdate}
            onError={() => handleError('動画ファイルの再生に失敗しました')}
            onLoadStart={() => setIsLoading(true)}
            onLoadedData={() => setIsLoading(false)}
          >
            <source src={videoUrl} type="video/mp4" />
            <source src={videoUrl} type="video/webm" />
            お使いのブラウザは動画の再生をサポートしていません。
          </video>

          {/* カスタムコントロール */}
          <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2 sm:p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {/* プログレスバー */}
            <div className="relative mb-2 sm:mb-3">
              <input
                type="range"
                min={0}
                max={duration}
                value={currentTime}
                onChange={handleSeek}
                disabled={!isCompleted && currentTime === 0}
                className="w-full h-2 sm:h-3 bg-gray-600 rounded-full appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(currentTime / duration) * 100}%, #4b5563 ${(currentTime / duration) * 100}%, #4b5563 ${(buffered / duration) * 100}%, #1f2937 ${(buffered / duration) * 100}%, #1f2937 100%)`
                }}
              />
            </div>

            {/* コントロールボタン */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-4">
                {/* 再生/一時停止ボタン */}
                <button
                  onClick={togglePlay}
                  className="text-white hover:text-blue-400 transition-colors p-1"
                >
                  {isPlaying ? (
                    <PauseIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                  ) : (
                    <PlayIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                  )}
                </button>

                {/* ボリュームコントロール */}
                <div className="flex items-center gap-1 sm:gap-2">
                  <button
                    onClick={toggleMute}
                    className="text-white hover:text-blue-400 transition-colors p-1"
                  >
                    {isMuted || volume === 0 ? (
                      <SpeakerXMarkIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                    ) : (
                      <SpeakerWaveIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.1}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-12 sm:w-20 h-1 bg-gray-600 rounded-full appearance-none cursor-pointer"
                  />
                </div>

                {/* 時間表示 */}
                <div className="text-white text-xs sm:text-sm">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* フルスクリーンボタン */}
                <button
                  onClick={toggleFullscreen}
                  className="text-white hover:text-blue-400 transition-colors p-1"
                  title={isFullscreen ? "全画面を終了" : "全画面表示"}
                >
                  {isFullscreen ? (
                    <ArrowsPointingInIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                  ) : (
                    <ArrowsPointingOutIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                  )}
                </button>
              </div>
            </div>

            {/* タイトル表示 */}
            {title && (
              <div className="mt-2 sm:mt-3">
                <h3 className="text-white text-sm sm:text-lg font-semibold truncate">{title}</h3>
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