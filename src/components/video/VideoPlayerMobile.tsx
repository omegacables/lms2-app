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
  onSaveProgressRef?: React.MutableRefObject<(() => void) | null>;
}

export default function VideoPlayerMobile({
  videoId,
  videoUrl,
  title,
  currentPosition = 0,
  isCompleted = false,
  onProgressUpdate,
  onError,
  onSaveProgressRef
}: VideoPlayerMobileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // セッション管理
  const sessionStartTimeRef = useRef<number>(0);
  const lastPositionRef = useRef<number>(0);
  const watchedSegmentsRef = useRef<Array<{start: number, end: number}>>([]);
  // 早送り制御用：これまでに視聴した最大位置（未完了の間はこれより先へ進めない）
  const maxWatchedTimeRef = useRef<number>(0);

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
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  const playbackRateOptions = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  // 進捗管理
  const [totalWatchedTime, setTotalWatchedTime] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [hasCompletedOnce, setHasCompletedOnce] = useState(isCompleted);

  // タイマー管理
  const progressSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);
  const playTimeTrackingRef = useRef<NodeJS.Timeout | null>(null);

  // バックグラウンド移行時の自動再開用 ref
  const wasPlayingBeforeBlurRef = useRef<boolean>(false);
  const savedPositionBeforeBlurRef = useRef<number>(0);

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
  const saveProgress = useCallback((isUrgent: boolean = false) => {
    if (!videoRef.current || !onProgressUpdate) {
      console.log('[VideoPlayer] ⚠️ 保存不可 - videoRef or onProgressUpdate がない');
      return;
    }

    // ✅ 既に100%完了済みの場合は一切保存しない（ユーザー要求：100%になったら一切ログをとらない）
    if (isCompleted) {
      console.log('[VideoPlayer] ⛔ 100%完了済み - 進捗保存をスキップ', { isUrgent });
      return;
    }

    const currentTime = videoRef.current.currentTime;
    const videoDuration = videoRef.current.duration;

    // 緊急保存の場合でも、有効な視聴データがある場合のみ保存
    if (isUrgent) {
      // メタデータが読み込まれていない、または有効な視聴時間がない場合はスキップ
      if (videoDuration <= 0 || isNaN(videoDuration) || currentTime <= 0 || isNaN(currentTime)) {
        console.log('[VideoPlayer] ⚠️ 緊急保存スキップ - 無効なメタデータ', {
          videoDuration,
          currentTime,
          reason: videoDuration <= 0 ? 'duration未取得' : currentTime <= 0 ? 'currentTime未取得' : 'NaN値'
        });
        return;
      }

      const actualWatchedTime = calculateActualWatchedTime();
      const progress = Math.min(Math.round((currentTime / videoDuration) * 100), 100);
      const isNowComplete = progress >= COMPLETION_THRESHOLD;

      console.log('[VideoPlayer] 🚨 緊急保存実行', {
        currentTime: currentTime.toFixed(2),
        videoDuration: videoDuration.toFixed(2),
        watchedTime: actualWatchedTime.toFixed(2),
        progress,
        isComplete: isNowComplete
      });

      try {
        onProgressUpdate(currentTime, actualWatchedTime, progress, isNowComplete);
        console.log('[VideoPlayer] ✅ 緊急進捗保存完了');
      } catch (err) {
        console.error('[VideoPlayer] ❌ 緊急進捗保存エラー:', err);
      }
      return;
    }

    // 通常保存はメタデータチェック
    // ✅ Normal save - only for non-urgent saves with valid metadata
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
        console.log('[VideoPlayer] ✅ 動画完了 - これが最後のログ保存', { progress, actualWatchedTime });
      }

      // 通常時は非同期で進捗を送信（動画再生に影響を与えない）
      setTimeout(() => {
        try {
          console.log('[VideoPlayer] 📝 通常進捗保存', {
            currentTime: currentTime.toFixed(2),
            watchedTime: actualWatchedTime.toFixed(2),
            progress,
            isComplete: isNowComplete
          });
          onProgressUpdate(currentTime, actualWatchedTime, progress, isNowComplete);
        } catch (err) {
          console.error('[VideoPlayer] ❌ 進捗保存エラー:', err);
        }
      }, 0);
    }
  }, [onProgressUpdate, hasCompletedOnce, isCompleted]);

  // 親コンポーネントから進捗保存を呼び出せるようにする
  useEffect(() => {
    if (onSaveProgressRef) {
      onSaveProgressRef.current = () => {
        console.log('[VideoPlayer] 親コンポーネントから進捗保存を呼び出し');
        saveProgress(true); // 緊急保存として実行
      };
    }
    return () => {
      if (onSaveProgressRef) {
        onSaveProgressRef.current = null;
      }
    };
  }, [saveProgress, onSaveProgressRef]);

  // 続きから再生時の初回ログ保存
  // 動画が読み込まれて、currentPositionがあり、まだ初回ログを保存していない場合
  const hasLoggedResumeRef = useRef(false);
  useEffect(() => {
    // videoIdが変わったらリセット
    hasLoggedResumeRef.current = false;
  }, [videoId]);

  useEffect(() => {
    // ✅ 100%完了済みの場合は初回ログも保存しない
    if (isCompleted) {
      console.log('[VideoPlayer] ⛔ 100%完了済み - 続きから再生ログをスキップ');
      return;
    }

    if (
      videoRef.current &&
      duration > 0 && // 動画のメタデータが読み込まれている
      currentPosition > 0 && // 続きから再生
      !hasLoggedResumeRef.current && // まだ初回ログを保存していない
      !isLoading // ローディング中でない
    ) {
      console.log('[VideoPlayer] 📹 続きから再生 - 初回ログ保存', {
        videoId,
        currentPosition,
        duration
      });

      hasLoggedResumeRef.current = true;

      // 少し遅延させて確実に保存
      setTimeout(() => {
        saveProgress(false);
      }, 1000);
    }
  }, [videoId, duration, currentPosition, isLoading, isCompleted, saveProgress]);

  // 定期的な進捗保存（10秒ごと）
  useEffect(() => {
    if (isPlaying) {
      progressSaveTimerRef.current = setInterval(() => {
        saveProgress();
      }, 10000); // 10秒ごと

      return () => {
        if (progressSaveTimerRef.current) {
          clearInterval(progressSaveTimerRef.current);
        }
      };
    }
  }, [isPlaying, saveProgress]);

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

      // 前回の視聴位置から再開
      if (currentPosition > 0 && currentPosition < videoDuration) {
        videoRef.current.currentTime = currentPosition;
        lastPositionRef.current = currentPosition;
        maxWatchedTimeRef.current = currentPosition;
        console.log('[VideoPlayer] 続きから再生 - 位置設定', {
          currentPosition
        });
        // 初回ログ保存は useEffect で自動的に実行される
      } else {
        lastPositionRef.current = 0;
        maxWatchedTimeRef.current = 0;
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
    // 初回ログ保存は useEffect で自動的に実行される
  };

  // 時間の更新
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const currentTime = videoRef.current.currentTime;

      // 未完了の間は未視聴部分への早送りを阻止（ネイティブコントロール等の迂回対策）
      if (!hasCompletedOnce && currentTime > maxWatchedTimeRef.current + 2) {
        videoRef.current.currentTime = maxWatchedTimeRef.current;
        setCurrentTime(maxWatchedTimeRef.current);
        return;
      }

      // 視聴済みの最大位置を更新
      if (!hasCompletedOnce && currentTime > maxWatchedTimeRef.current) {
        maxWatchedTimeRef.current = currentTime;
      }

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

  // タップ/クリック時の処理（コントロール表示 + 再生/停止切替）
  const handleContainerClick = () => {
    setShowControls(true);
    hideControlsAfterDelay();
    togglePlay();
  };

  // 動画の再生開始時
  const handlePlay = () => {
    console.log('[VideoPlayer] 再生開始');
    setIsPlaying(true);
    sessionStartTimeRef.current = Date.now();

    if (videoRef.current) {
      lastPositionRef.current = videoRef.current.currentTime;

      // 再生開始時に初回ログを保存（視聴開始の記録）
      console.log('[VideoPlayer] 再生開始 - 初回ログ保存');
      setTimeout(() => {
        saveProgress(false);
      }, 1000); // 1秒後に保存
    }

    hideControlsAfterDelay();
  };

  // 動画の一時停止時
  const handlePause = () => {
    console.log('[VideoPlayer] 一時停止');
    setIsPlaying(false);
    setShowControls(true);

    // 一時停止時に進捗を保存（常に実行）
    saveProgress();

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

    // 最終的な進捗を保存（常に実行）
    saveProgress();

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

  // シーク（未完了の間は未視聴部分への早送りは不可。視聴済み範囲内と巻き戻しは可）
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (videoRef.current) {
      if (!hasCompletedOnce && newTime > maxWatchedTimeRef.current) {
        videoRef.current.currentTime = maxWatchedTimeRef.current;
        setCurrentTime(maxWatchedTimeRef.current);
        return;
      }
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  // 再生速度の変更（未完了の間は等速より速い再生＝早送りは不可）
  const handlePlaybackRateChange = (rate: number) => {
    if (!hasCompletedOnce && rate > 1) {
      return;
    }
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
      setShowSpeedMenu(false);
    }
  };

  // 動画読み込み後、保存された再生速度を適用
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, duration]);

  // スペースキーで再生/停止（input/textarea/button 等にフォーカス中は無効）
  const togglePlayRef = useRef<() => void>(() => {});
  togglePlayRef.current = togglePlay;
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || target?.isContentEditable) return;
      e.preventDefault();
      togglePlayRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // フルスクリーン切り替え
  const toggleFullscreen = async () => {
    if (!videoRef.current && !containerRef.current) return;

    try {
      console.log('[VideoPlayer] フルスクリーン切り替え開始', {
        isFullscreen,
        hasFullscreenElement: !!document.fullscreenElement,
        isMobile,
        userAgent: navigator.userAgent
      });

      // すでにフルスクリーンの場合は終了
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        console.log('[VideoPlayer] フルスクリーン終了');
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
        setIsFullscreen(false);
        return;
      }

      // フルスクリーンを開始
      let fullscreenSuccess = false;

      // 方法1: iOS Safari - 動画要素のネイティブ全画面
      if (videoRef.current && 'webkitEnterFullscreen' in videoRef.current) {
        console.log('[VideoPlayer] iOS Safari フルスクリーン (webkitEnterFullscreen)');
        try {
          (videoRef.current as any).webkitEnterFullscreen();
          setIsFullscreen(true);
          fullscreenSuccess = true;
        } catch (err) {
          console.warn('[VideoPlayer] webkitEnterFullscreen 失敗:', err);
        }
      }

      // 方法2: Fullscreen API (container)
      if (!fullscreenSuccess && containerRef.current) {
        if (containerRef.current.requestFullscreen) {
          console.log('[VideoPlayer] 標準 Fullscreen API (container)');
          await containerRef.current.requestFullscreen();
          setIsFullscreen(true);
          fullscreenSuccess = true;
        } else if ((containerRef.current as any).webkitRequestFullscreen) {
          console.log('[VideoPlayer] Webkit Fullscreen API (container)');
          await (containerRef.current as any).webkitRequestFullscreen();
          setIsFullscreen(true);
          fullscreenSuccess = true;
        } else if ((containerRef.current as any).mozRequestFullScreen) {
          console.log('[VideoPlayer] Moz Fullscreen API (container)');
          await (containerRef.current as any).mozRequestFullScreen();
          setIsFullscreen(true);
          fullscreenSuccess = true;
        } else if ((containerRef.current as any).msRequestFullscreen) {
          console.log('[VideoPlayer] MS Fullscreen API (container)');
          await (containerRef.current as any).msRequestFullscreen();
          setIsFullscreen(true);
          fullscreenSuccess = true;
        }
      }

      // 方法3: Fullscreen API (video)
      if (!fullscreenSuccess && videoRef.current) {
        if ((videoRef.current as any).requestFullscreen) {
          console.log('[VideoPlayer] 標準 Fullscreen API (video)');
          await (videoRef.current as any).requestFullscreen();
          setIsFullscreen(true);
          fullscreenSuccess = true;
        } else if ((videoRef.current as any).webkitRequestFullscreen) {
          console.log('[VideoPlayer] Webkit Fullscreen API (video)');
          await (videoRef.current as any).webkitRequestFullscreen();
          setIsFullscreen(true);
          fullscreenSuccess = true;
        }
      }

      if (!fullscreenSuccess) {
        console.error('[VideoPlayer] すべてのフルスクリーン方法が失敗しました');
        // エラーメッセージを表示
        alert('このブラウザでは全画面表示がサポートされていません。\n\n別のブラウザ（Chrome、Safari）をお試しください。');
      }

    } catch (err: any) {
      console.error('[VideoPlayer] フルスクリーンエラー:', err);
      console.error('[VideoPlayer] エラー詳細:', {
        name: err.name,
        message: err.message,
        stack: err.stack
      });

      // ユーザーフレンドリーなエラーメッセージ
      if (err.name === 'TypeError' && err.message.includes('fullscreen')) {
        alert('このデバイスでは全画面表示がサポートされていません。');
      } else {
        alert('全画面表示に切り替えることができませんでした。\n\nページをリロードして再度お試しください。');
      }
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
      // 最終的な進捗を保存（常に実行）
      if (videoRef.current) {
        saveProgress(true); // 緊急保存
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
  }, [saveProgress]);

  // ページを離れる前に進捗を保存
  useEffect(() => {
    // ✅ 100%完了済みでない場合は常に保存
    const shouldSave = () => {
      // 100%完了済みの場合は保存しない
      if (isCompleted) {
        console.log('[VideoPlayer] ⛔ 100%完了済み - 離脱時保存をスキップ');
        return false;
      }
      // それ以外は常に保存
      return true;
    };

    // beforeunload: ページを離れる前の保存（ダイアログはlearn/page.tsxで管理）
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      console.log('[VideoPlayer] beforeunload - 進捗保存のみ実行', {
        currentTime: videoRef.current?.currentTime,
        duration: videoRef.current?.duration,
        isPlaying,
        isCompleted
      });

      // ✅ 100%未完了の場合は必ず保存（ダイアログは表示しない）
      if (shouldSave()) {
        console.log('[VideoPlayer] 🚨 ページ離脱前 - 緊急進捗保存');
        saveProgress(true); // 緊急保存
      }
    };

    // pagehide: ページが完全にアンロードされる直前（最後のチャンス）
    const handlePageHide = (e: PageTransitionEvent) => {
      if (shouldSave()) {
        console.log('[VideoPlayer] 🚨 ページ離脱 (pagehide) - 最終保存');
        saveProgress(true); // 緊急保存
      }
    };

    // 復帰時に再生を試みる共通処理（リトライ付き）
    const attemptResume = (label: string) => {
      const video = videoRef.current;
      if (!video) return;

      // 位置がリセットされていたら復元
      if (savedPositionBeforeBlurRef.current > 1) {
        const savedPos = savedPositionBeforeBlurRef.current;
        const currentPos = video.currentTime;
        if (Math.abs(currentPos - savedPos) > 5 || currentPos < 1) {
          video.currentTime = savedPos;
          setCurrentTime(savedPos);
          console.log(`[VideoPlayer] (${label}) 位置を復元: ${savedPos.toFixed(2)}秒 (前: ${currentPos.toFixed(2)}秒)`);
        }
      }

      if (!wasPlayingBeforeBlurRef.current) return;
      if (!video.paused) return;

      const tryPlay = (attempt: number) => {
        const v = videoRef.current;
        if (!v || !v.paused) return;
        console.log(`[VideoPlayer] (${label}) 自動再開を試行 #${attempt}`);
        v.play()
          .then(() => {
            console.log(`[VideoPlayer] (${label}) 自動再開成功`);
            setIsPlaying(true);
          })
          .catch(err => {
            console.warn(`[VideoPlayer] (${label}) 自動再開失敗 #${attempt}:`, err?.name ?? err);
            if (attempt < 3) {
              setTimeout(() => tryPlay(attempt + 1), 600);
            }
          });
      };
      setTimeout(() => tryPlay(1), 300);
    };

    // visibilitychange: バックグラウンド移行 → 状態保存 / フォアグラウンド復帰 → 自動再開
    const handleVisibilityChange = () => {
      const video = videoRef.current;
      if (document.hidden) {
        if (video) {
          wasPlayingBeforeBlurRef.current = !video.paused;
          savedPositionBeforeBlurRef.current = video.currentTime;
        }
        if (shouldSave()) {
          console.log('[VideoPlayer] 📱 バックグラウンド移行 - 進捗保存');
          saveProgress(true);
        }
      } else {
        console.log('[VideoPlayer] 📱 フォアグラウンド復帰');
        attemptResume('visibilitychange');
      }
    };

    // window focus でも再開を試みる（visibilitychange が発火しない環境向け）
    const handleWindowFocus = () => {
      if (!document.hidden) attemptResume('focus');
    };

    // bfcache から戻った場合の保険
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        console.log('[VideoPlayer] bfcache から復帰');
        attemptResume('pageshow');
      }
    };

    // freeze: モバイルでページがフリーズされる前（PWA、バックグラウンド）
    const handleFreeze = () => {
      if (shouldSave()) {
        console.log('[VideoPlayer] 🧊 ページフリーズ前 - 進捗保存');
        saveProgress(true); // 緊急保存
      }
    };

    // スマホでのスクロール検出（ページ内遷移の可能性）
    let scrollTimeout: NodeJS.Timeout | null = null;
    const handleScroll = () => {
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (shouldSave()) {
          console.log('[VideoPlayer] 📜 スクロール検出 - 進捗保存');
          saveProgress(false); // 通常保存
        }
      }, 2000); // 2秒間スクロールが止まったら保存
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('freeze', handleFreeze);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('scroll', handleScroll, { passive: true });

    // 定期的な自動保存（10秒ごと）- フォールバック
    const autoSaveInterval = setInterval(() => {
      if (shouldSave()) {
        console.log('[VideoPlayer] ⏰ 定期自動保存');
        saveProgress();
      }
    }, 10000);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('freeze', handleFreeze);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeout) clearTimeout(scrollTimeout);
      clearInterval(autoSaveInterval);

      // アンマウント時の最終保存
      if (shouldSave()) {
        console.log('[VideoPlayer] 💀 コンポーネントアンマウント - 最終保存');
        saveProgress(true); // 緊急保存
      }
    };
  }, [saveProgress, isCompleted]);

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
            {/* プログレスバー - スマホで操作しやすく */}
            <div className="relative mb-2 sm:mb-3 py-2">
              <input
                type="range"
                min={0}
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-3 sm:h-3 bg-gray-600 rounded-full appearance-none cursor-pointer touch-manipulation"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(currentTime / duration) * 100}%, #4b5563 ${(currentTime / duration) * 100}%, #4b5563 ${(buffered / duration) * 100}%, #1f2937 ${(buffered / duration) * 100}%, #1f2937 100%)`
                }}
              />
              {/* 進捗率表示 */}
              <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 bg-black/90 px-3 py-1 rounded-full text-xs sm:text-sm font-bold text-white shadow-lg">
                {progressPercent}%
              </div>
            </div>

            {/* コントロールボタン */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 flex-1">
                {/* 再生/一時停止ボタン - スマホで押しやすく */}
                <button
                  onClick={togglePlay}
                  className="text-white hover:text-blue-400 active:text-blue-500 transition-colors p-2 sm:p-2.5 touch-manipulation bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-lg"
                  aria-label={isPlaying ? "一時停止" : "再生"}
                >
                  {isPlaying ? (
                    <PauseIcon className="h-8 w-8 sm:h-9 sm:w-9" />
                  ) : (
                    <PlayIcon className="h-8 w-8 sm:h-9 sm:w-9" />
                  )}
                </button>

                {/* 時間表示 */}
                <div className="text-white text-xs sm:text-sm font-medium whitespace-nowrap">
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

              <div className="flex items-center gap-1 sm:gap-2">
                {/* モバイルでのミュートボタン */}
                {isMobile && (
                  <button
                    onClick={toggleMute}
                    className="text-white hover:text-blue-400 active:text-blue-500 transition-colors p-2 sm:p-2.5 touch-manipulation bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-lg"
                    aria-label={isMuted ? "ミュート解除" : "ミュート"}
                  >
                    {isMuted ? (
                      <SpeakerXMarkIcon className="h-7 w-7 sm:h-8 sm:w-8" />
                    ) : (
                      <SpeakerWaveIcon className="h-7 w-7 sm:h-8 sm:w-8" />
                    )}
                  </button>
                )}

                {/* 再生速度ボタン */}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSpeedMenu((v) => !v);
                    }}
                    className="text-white hover:text-blue-400 active:text-blue-500 transition-colors px-3 py-2 sm:py-2.5 touch-manipulation bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-lg text-sm sm:text-base font-bold min-w-[3rem]"
                    aria-label="再生速度"
                    title="再生速度"
                    type="button"
                  >
                    {playbackRate}x
                  </button>
                  {showSpeedMenu && (
                    <div
                      className="absolute bottom-full right-0 mb-2 bg-black/95 rounded-lg overflow-hidden shadow-xl min-w-[6rem] z-20"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {playbackRateOptions.map((rate) => {
                        const rateLocked = !hasCompletedOnce && rate > 1;
                        return (
                          <button
                            key={rate}
                            onClick={() => handlePlaybackRateChange(rate)}
                            disabled={rateLocked}
                            title={rateLocked ? '視聴完了後に利用できます' : undefined}
                            className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                              rateLocked
                                ? 'text-gray-500 cursor-not-allowed'
                                : rate === playbackRate
                                ? 'text-blue-400 font-semibold hover:bg-white/20'
                                : 'text-white hover:bg-white/20'
                            }`}
                            type="button"
                          >
                            {rate}x{rate === 1 ? ' (標準)' : ''}{rateLocked ? ' 🔒' : ''}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* フルスクリーンボタン - スマホで押しやすく大きく目立つ */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log('[VideoPlayer] 全画面ボタンクリック');
                    toggleFullscreen();
                  }}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    console.log('[VideoPlayer] 全画面ボタンタッチ');
                    toggleFullscreen();
                  }}
                  className="text-white hover:text-blue-400 active:text-blue-500 transition-all duration-200 p-3 touch-manipulation bg-blue-600/80 hover:bg-blue-600 active:bg-blue-700 rounded-lg shadow-lg active:scale-95"
                  title={isFullscreen ? "全画面を終了" : "全画面表示"}
                  aria-label={isFullscreen ? "全画面を終了" : "全画面表示"}
                  type="button"
                >
                  {isFullscreen ? (
                    <ArrowsPointingInIcon className="h-9 w-9 sm:h-11 sm:w-11" />
                  ) : (
                    <ArrowsPointingOutIcon className="h-9 w-9 sm:h-11 sm:w-11" />
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
