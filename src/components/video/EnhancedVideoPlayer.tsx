'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/database/supabase';
import {
  ExclamationTriangleIcon,
  ArrowPathIcon,
  PlayIcon,
  PauseIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon
} from '@heroicons/react/24/outline';

interface EnhancedVideoPlayerProps {
  videoUrl: string;
  videoId: number;
  title?: string;
  currentPosition?: number;
  onProgressUpdate?: (position: number, videoDuration: number, progressPercent: number) => void;
  onComplete?: () => void;
  enableSkipPrevention?: boolean;
  completionThreshold?: number;
  isCompleted?: boolean;
}

export function EnhancedVideoPlayer({
  videoUrl,
  videoId,
  title = '',
  currentPosition = 0,
  onProgressUpdate,
  onComplete,
  enableSkipPrevention = true,
  completionThreshold = 95,
  isCompleted = false
}: EnhancedVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showWarning, setShowWarning] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [maxWatchedTime, setMaxWatchedTime] = useState(0);
  const [viewingSession, setViewingSession] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);

  // 初期位置を設定
  useEffect(() => {
    if (currentPosition > 0) {
      setCurrentTime(currentPosition);
      setMaxWatchedTime(currentPosition);
      if (videoRef.current) {
        videoRef.current.currentTime = currentPosition;
      }
    }
  }, [currentPosition]);

  // 警告ダイアログの承認
  const handleAcceptWarning = () => {
    setShowWarning(false);
    startWatching();
  };

  // 視聴開始
  const startWatching = async () => {
    const sessionId = crypto.randomUUID();
    setViewingSession(sessionId);

    // 自動再生開始
    if (videoRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  // 進捗更新（15秒ごと、バックグラウンドで実行）
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      // requestIdleCallbackを使用してアイドル時に実行
      const updateFunc = () => {
        if (videoRef.current && onProgressUpdate) {
          const currentPos = videoRef.current.currentTime;
          const progressPercent = duration > 0 ? Math.floor((currentPos / duration) * 100) : 0;

          // 非同期で進捗更新を呼び出し
          Promise.resolve().then(() => {
            onProgressUpdate(currentPos, duration, progressPercent);
          });
        }
      };

      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(updateFunc, { timeout: 2000 });
      } else {
        // requestIdleCallbackがサポートされていない場合
        setTimeout(updateFunc, 100);
      }
    }, 15000); // 15秒ごとに更新

    return () => clearInterval(interval);
  }, [isPlaying, duration, onProgressUpdate]);

  // 動画のメタデータ読み込み
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      if (currentTime > 0) {
        videoRef.current.currentTime = currentTime;
      }
    }
  };

  // 再生時間更新
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      setCurrentTime(current);

      // スキップ防止: 最大視聴時間を超えた場合は戻す（完了していない動画でスキップ防止が有効時のみ）
      if (!isCompleted && enableSkipPrevention && current > maxWatchedTime + 1) {
        videoRef.current.currentTime = maxWatchedTime;
        alert('スキップはできません。順番に視聴してください。');
      } else {
        setMaxWatchedTime(Math.max(maxWatchedTime, current));
      }

      const progressPercent = duration > 0 ? (current / duration) * 100 : 0;
      setProgress(progressPercent);
    }
  };

  // 動画終了時
  const handleEnded = async () => {
    if (onProgressUpdate) {
      onProgressUpdate(duration, duration, 100);
    }
    if (onComplete) {
      onComplete();
    }
    setIsPlaying(false);
  };

  // 5秒戻る
  const handleRewind = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
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

  // コントロールの自動非表示
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

  const handleMouseMove = () => {
    setShowControls(true);
    hideControlsAfterDelay();
  };

  const handleMouseLeave = () => {
    if (isPlaying) {
      hideControlsAfterDelay();
    }
  };

  // 再生/一時停止
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
        setShowControls(true);
      } else {
        videoRef.current.play();
        setIsPlaying(true);
        hideControlsAfterDelay();
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
      // 完了済みまたはスキップ防止が無効な場合はシーク可能
      if (isCompleted || !enableSkipPrevention) {
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      } else if (newTime <= maxWatchedTime) {
        // 未完了でも既に視聴した範囲内ならシーク可能
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      } else {
        alert('まだ視聴していない部分にはスキップできません。');
      }
    }
  };

  // ブラウザバック時の警告
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isPlaying) {
        e.preventDefault();
        e.returnValue = '視聴履歴を保存しますか？';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isPlaying]);

  // 右クリック無効化（未完了動画のみ）
  const handleContextMenu = (e: React.MouseEvent) => {
    if (!isCompleted) {
      e.preventDefault();
      return false;
    }
  };

  // 完了済み動画の場合は警告をスキップして自動再生しない
  useEffect(() => {
    if (isCompleted && showWarning) {
      setShowWarning(false);
      setViewingSession(crypto.randomUUID());
    }
  }, [isCompleted, showWarning]);

  // コンポーネントのアンマウント時
  useEffect(() => {
    return () => {
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };
  }, []);

  // 時間フォーマット
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 警告ダイアログまたは動画プレイヤーを表示
  if (showWarning && !isCompleted) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="liquid-glass-interactive dark:bg-neutral-900 rounded-lg p-8 max-w-2xl mx-4">
          <div className="flex items-center mb-4">
            <ExclamationTriangleIcon className="h-8 w-8 text-yellow-500 mr-3" />
            <h2 className="text-2xl font-bold">視聴に関する重要な注意事項</h2>
          </div>

          <div className="space-y-4 mb-6">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4">
              <p className="font-semibold">以下の点にご注意ください：</p>
              <ol className="list-decimal list-inside mt-2 space-y-2">
                <li>動画の視聴は必ず就業時間内に行ってください。</li>
                <li>1回目の視聴のみ視聴ログを記録します。</li>
                <li>再度見直す場合はそのまま再生を続けてください。</li>
                <li>途中で再生をやめてしまった場合は進捗をリセットしてください。</li>
              </ol>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 p-4">
              <p className="font-semibold">視聴ルール：</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>動画のスキップはできません</li>
                <li>早送りは禁止されています</li>
                <li>5秒戻るボタンのみ使用可能です</li>
                <li>視聴履歴は自動的に保存されます</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-center space-x-4">
            <button
              onClick={() => window.history.back()}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              戻る
            </button>
            <button
              onClick={handleAcceptWarning}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              理解して視聴を開始
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative bg-black rounded-lg overflow-hidden group"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        className={`w-full h-full ${!showControls && isPlaying ? 'cursor-none' : ''}`}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onContextMenu={handleContextMenu}
        onPlay={() => {
          setIsPlaying(true);
          hideControlsAfterDelay();
        }}
        onPause={() => {
          setIsPlaying(false);
          setShowControls(true);
        }}
        controlsList="nodownload"
        disablePictureInPicture={!isCompleted}
        preload="auto"
        playsInline
      />

      {/* カスタムコントロール */}
      <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2 sm:p-4 transition-opacity duration-300 ${
        showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}>
        {/* プログレスバー */}
        <div className="relative mb-2 sm:mb-3">
          <input
            type="range"
            min={0}
            max={duration}
            value={currentTime}
            onChange={handleSeek}
            disabled={!isCompleted && enableSkipPrevention && currentTime > maxWatchedTime}
            className="w-full h-1 sm:h-2 bg-gray-600 rounded-full appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(currentTime / duration) * 100}%, #4b5563 ${(currentTime / duration) * 100}%, #4b5563 100%)`
            }}
          />
          {!isCompleted && enableSkipPrevention && (
            <div
              className="absolute h-full bg-blue-300 opacity-50 rounded-full pointer-events-none"
              style={{
                width: `${(maxWatchedTime / duration) * 100}%`,
                top: 0,
                left: 0
              }}
            />
          )}
        </div>

        {/* コントロールボタン */}
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-2 sm:gap-4">
            {/* 再生/一時停止ボタン */}
            <button
              onClick={togglePlay}
              className="p-1 hover:bg-white/20 rounded transition-colors"
            >
              {isPlaying ? (
                <PauseIcon className="h-5 w-5 sm:h-6 sm:w-6" />
              ) : (
                <PlayIcon className="h-5 w-5 sm:h-6 sm:w-6" />
              )}
            </button>

            {/* 5秒戻るボタン */}
            <button
              onClick={handleRewind}
              className="flex items-center px-2 sm:px-3 py-1 hover:bg-white/20 rounded transition-colors"
            >
              <ArrowPathIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-1" />
              <span className="text-xs sm:text-sm">5秒</span>
            </button>

            {/* ボリュームコントロール */}
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={toggleMute}
                className="p-1 hover:bg-white/20 rounded transition-colors"
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
            <span className="text-xs sm:text-sm">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* 進捗表示 */}
            <span className="text-xs sm:text-sm">
              進捗: {Math.floor(progress)}%
            </span>

            {/* フルスクリーンボタン */}
            <button
              onClick={toggleFullscreen}
              className="p-1 hover:bg-white/20 rounded transition-colors"
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
      </div>
    </div>
  );
}