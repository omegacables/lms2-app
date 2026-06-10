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
  onBeforeUnload?: () => void;
  onPlayStart?: () => void;
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
  onBeforeUnload,
  onPlayStart,
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
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);

  const playbackRateOptions = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  // 未完了の間は早送り（未視聴部分へのシーク・倍速再生）をロック
  const skipLocked = !isCompleted && enableSkipPrevention;

  // バッファリング状態の管理
  const [isBuffering, setIsBuffering] = useState(true);
  const [bufferProgress, setBufferProgress] = useState(0);
  const [isReadyToPlay, setIsReadyToPlay] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('動画を読み込んでいます...');
  const [wasPlayingBeforeBlur, setWasPlayingBeforeBlur] = useState(false);
  // 復帰判定は ref で行う（state は描画用、ref は handler 内の即時参照用）
  const wasPlayingBeforeBlurRef = useRef<boolean>(false);
  const bufferCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const autoResumeTimeout = useRef<NodeJS.Timeout | null>(null);
  const savedPositionBeforeBlur = useRef<number>(0);

  // デバイスタイプの検出
  const isMobile = typeof window !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // 初期位置を設定（初回マウント時のみ）
  useEffect(() => {
    if (currentPosition > 0) {
      setCurrentTime(currentPosition);
      setMaxWatchedTime(currentPosition);
      console.log('[VideoPlayer] 初期位置を設定:', currentPosition);
    }
  }, [currentPosition]); // currentPositionが変わったら再設定

  // 警告ダイアログの承認
  const handleAcceptWarning = () => {
    setShowWarning(false);
    startWatching();
  };

  // 視聴開始
  const startWatching = async () => {
    const sessionId = crypto.randomUUID();
    setViewingSession(sessionId);

    // 再生開始時に親コンポーネントに通知（開始時刻を記録）
    if (onPlayStart) {
      onPlayStart();
    }

    // 動画のロードを確実に開始
    if (videoRef.current) {
      videoRef.current.load();
    }

    // バッファが十分貯まるまで必ず待機（スマホは特に厳格）
    setLoadingMessage(isMobile
      ? '動画を読み込んでいます...\n📱 スマホでの快適な視聴のため、十分なバッファを確保中です'
      : '動画を読み込んでいます。十分なバッファを確保中...'
    );
    setIsBuffering(true);

    // バッファ進捗を積極的にチェック（200msごと）
    const bufferCheckInterval = setInterval(() => {
      updateBufferProgress();
    }, 200);

    // 準備完了まで待機（最大120秒）
    const checkReady = setInterval(() => {
      if (isReadyToPlay && videoRef.current) {
        clearInterval(checkReady);
        clearInterval(bufferCheckInterval);
        console.log('[VideoPlayer] ✅ バッファ準備完了: 再生を開始します');
        setIsBuffering(false);
        videoRef.current.play();
        setIsPlaying(true);
      }
    }, 300);

    // タイムアウト（120秒）
    setTimeout(() => {
      clearInterval(checkReady);
      clearInterval(bufferCheckInterval);
      if (!isReadyToPlay && videoRef.current) {
        // タイムアウトしても再生を試みる（最終手段）
        console.log('[VideoPlayer] ⚠️ タイムアウト: 現在のバッファで再生を開始します (バッファ:', bufferProgress, '%)');
        setIsReadyToPlay(true);
        setIsBuffering(false);
        videoRef.current.play();
        setIsPlaying(true);
      }
    }, 120000);

    // バッファが準備できていれば即座に再生
    if (isReadyToPlay && videoRef.current) {
      clearInterval(checkReady);
      clearInterval(bufferCheckInterval);
      // すでに準備完了している場合はすぐに再生
      if (videoRef.current) {
        console.log('[VideoPlayer] バッファ準備済み: 即座に再生開始');
        videoRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  // 進捗を保存する関数（一時停止時、シーク時、終了時に呼ばれる）
  const saveProgress = () => {
    if (!onProgressUpdate || !videoRef.current || duration === 0) return;

    const currentPos = videoRef.current.currentTime;
    const progressPercent = duration > 0 ? Math.floor((currentPos / duration) * 100) : 0;

    // 0秒や0%の進捗は保存しない（誤った進捗の上書きを防ぐ）
    if (currentPos < 1 || progressPercent < 1) {
      console.log('[VideoPlayer] 進捗保存スキップ: 位置が0秒または0%です', { currentPos, progressPercent });
      return;
    }

    console.log('[VideoPlayer] 進捗を保存:', { currentPos: currentPos.toFixed(2), progressPercent });

    // 進捗を親コンポーネントに送信
    setTimeout(() => {
      onProgressUpdate(currentPos, duration, progressPercent);
    }, 0);
  };

  // バッファの進捗を更新
  const updateBufferProgress = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    if (video.buffered.length > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      const duration = video.duration;

      if (duration > 0) {
        const bufferPercent = Math.floor((bufferedEnd / duration) * 100);
        setBufferProgress(bufferPercent);

        // 現在の再生位置から先のバッファ量を計算
        const currentTime = video.currentTime;
        const bufferedAhead = bufferedEnd - currentTime;

        console.log('[VideoPlayer] バッファ状態:', {
          device: isMobile ? 'モバイル' : 'PC',
          bufferPercent: bufferPercent + '%',
          bufferedAhead: bufferedAhead.toFixed(1) + '秒先まで',
          currentTime: currentTime.toFixed(1),
          bufferedEnd: bufferedEnd.toFixed(1)
        });

        // スマホはより厳格なバッファリング閾値を使用
        const requiredBufferPercent = isMobile ? 60 : 50; // スマホは60%、PCは50%
        const requiredBufferAhead = isMobile ? 90 : 60;   // スマホは90秒、PCは60秒

        // バッファが十分貯まったら再生準備完了
        if ((bufferPercent >= requiredBufferPercent || bufferedAhead >= requiredBufferAhead) && !isReadyToPlay) {
          setIsReadyToPlay(true);
          setIsBuffering(false);
          setLoadingMessage('読み込み完了！');
          console.log('[VideoPlayer] バッファ準備完了:', bufferPercent + '% (', bufferedAhead.toFixed(1), '秒先まで) - デバイス:', isMobile ? 'モバイル' : 'PC');
        }

        // バッファが不足している場合は警告（スマホはより早めに警告）
        const warningThreshold = isMobile ? 15 : 10;
        if (bufferedAhead < warningThreshold && isPlaying && !isBuffering) {
          console.warn('[VideoPlayer] バッファ不足警告: 残り', bufferedAhead.toFixed(1), '秒 - デバイス:', isMobile ? 'モバイル' : 'PC');
        }
      }
    }
  };

  // 動画のメタデータ読み込み
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const videoDuration = videoRef.current.duration;
      setDuration(videoDuration);
      setLoadingMessage('動画データを読み込んでいます...');

      console.log('[VideoPlayer] メタデータ読み込み完了 - 動画時間:', videoDuration, '秒');

      // 保存された位置から再開（完了済みでない場合のみ）
      if (currentPosition > 0 && !isCompleted) {
        // 位置が動画の長さを超えていないか確認
        const startPosition = Math.min(currentPosition, videoDuration - 5); // 最後の5秒は避ける
        videoRef.current.currentTime = startPosition;
        setCurrentTime(startPosition);
        setMaxWatchedTime(startPosition);
        console.log('[VideoPlayer] 続きから再生:', startPosition, '秒から開始');
      } else if (isCompleted) {
        // 完了済みの場合は最初から
        videoRef.current.currentTime = 0;
        setCurrentTime(0);
        console.log('[VideoPlayer] 完了済みのため最初から再生');
      } else {
        console.log('[VideoPlayer] 最初から再生');
      }

      // バッファの進捗を開始
      updateBufferProgress();
    }
  };

  // バッファリング開始
  const handleWaiting = () => {
    setIsBuffering(true);
    setLoadingMessage('バッファリング中...');
    console.log('[VideoPlayer] バッファリング開始');

    // 5秒経っても再開しない場合は自動的に再開を試みる
    if (autoResumeTimeout.current) {
      clearTimeout(autoResumeTimeout.current);
    }

    autoResumeTimeout.current = setTimeout(() => {
      if (videoRef.current && isBuffering && !videoRef.current.paused) {
        console.log('[VideoPlayer] 自動復帰: 再生を再開します');
        videoRef.current.play().catch(err => {
          console.error('[VideoPlayer] 自動復帰失敗:', err);
        });
      }
    }, 5000);
  };

  // 再生可能になった
  const handleCanPlay = () => {
    updateBufferProgress();
    setIsBuffering(false);
    console.log('[VideoPlayer] 再生可能');

    // バッファリングから復帰した場合、再生を再開
    if (wasPlayingBeforeBlur && videoRef.current && videoRef.current.paused) {
      console.log('[VideoPlayer] バッファリング復帰: 再生を再開');
      videoRef.current.play().catch(err => {
        console.error('[VideoPlayer] 再生再開失敗:', err);
      });
    }
  };

  // 十分にバッファされた
  const handleCanPlayThrough = () => {
    setIsReadyToPlay(true);
    setIsBuffering(false);
    setLoadingMessage('');
    console.log('[VideoPlayer] 十分なバッファあり');

    // タイマーをクリア
    if (autoResumeTimeout.current) {
      clearTimeout(autoResumeTimeout.current);
      autoResumeTimeout.current = null;
    }
  };

  // バッファ進捗の更新
  const handleProgress = () => {
    updateBufferProgress();
  };

  // 再生時間更新
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;

      // 未完了の間は未視聴部分への早送りを阻止（ネイティブコントロール等の迂回対策）
      const allowedMax = Math.max(maxWatchedTime, currentPosition);
      if (skipLocked && current > allowedMax + 2) {
        videoRef.current.currentTime = allowedMax;
        setCurrentTime(allowedMax);
        return;
      }

      setCurrentTime(current);

      // 最大視聴時間を更新
      setMaxWatchedTime(prev => Math.max(prev, current));

      const progressPercent = duration > 0 ? (current / duration) * 100 : 0;
      setProgress(progressPercent);

      // 再生中は常時進捗を更新（親コンポーネント側でデバウンス処理）
      if (onProgressUpdate && duration > 0 && current > 0) {
        onProgressUpdate(current, duration, progressPercent);
        console.log('[EnhancedVideoPlayer] 進捗更新:', { current: current.toFixed(2), duration: duration.toFixed(2), progressPercent: progressPercent.toFixed(2) });
      }

      // 再生中はバッファリング状態を解除
      if (isBuffering && videoRef.current && !videoRef.current.paused) {
        setIsBuffering(false);
        setLoadingMessage('');
      }
    }
  };

  // 動画終了時
  const handleEnded = async () => {
    // 動画終了時に進捗を保存（完了として）
    saveProgress();
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
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container && !video) return;

    const doc = document as Document & {
      webkitFullscreenElement?: Element;
      webkitExitFullscreen?: () => Promise<void>;
      mozFullScreenElement?: Element;
      mozCancelFullScreen?: () => Promise<void>;
      msFullscreenElement?: Element;
      msExitFullscreen?: () => Promise<void>;
    };

    const isInFullscreen = !!(
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
    );

    try {
      if (isInFullscreen) {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          await doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          await doc.msExitFullscreen();
        }
        setIsFullscreen(false);
        return;
      }

      const target = container as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
        mozRequestFullScreen?: () => Promise<void>;
        msRequestFullscreen?: () => Promise<void>;
      };
      const videoEl = video as HTMLVideoElement & {
        webkitEnterFullscreen?: () => void;
        webkitRequestFullscreen?: () => Promise<void>;
      };

      if (target?.requestFullscreen) {
        await target.requestFullscreen();
        setIsFullscreen(true);
      } else if (target?.webkitRequestFullscreen) {
        await target.webkitRequestFullscreen();
        setIsFullscreen(true);
      } else if (target?.mozRequestFullScreen) {
        await target.mozRequestFullScreen();
        setIsFullscreen(true);
      } else if (target?.msRequestFullscreen) {
        await target.msRequestFullscreen();
        setIsFullscreen(true);
      } else if (videoEl?.webkitEnterFullscreen) {
        // iOS Safari は <video> 要素のみ全画面表示可能
        videoEl.webkitEnterFullscreen();
        setIsFullscreen(true);
      } else if (videoEl?.requestFullscreen) {
        await videoEl.requestFullscreen();
        setIsFullscreen(true);
      } else if (videoEl?.webkitRequestFullscreen) {
        await videoEl.webkitRequestFullscreen();
        setIsFullscreen(true);
      } else {
        alert('お使いのブラウザは全画面表示に対応していません。');
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  // フルスクリーン変更の監視
  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as Document & {
        webkitFullscreenElement?: Element;
        mozFullScreenElement?: Element;
        msFullscreenElement?: Element;
      };
      setIsFullscreen(!!(
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement
      ));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    // iOS Safari は video 要素の webkitbeginfullscreen / webkitendfullscreen を使う
    const videoEl = videoRef.current;
    const handleWebkitBegin = () => setIsFullscreen(true);
    const handleWebkitEnd = () => setIsFullscreen(false);
    videoEl?.addEventListener('webkitbeginfullscreen', handleWebkitBegin);
    videoEl?.addEventListener('webkitendfullscreen', handleWebkitEnd);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      videoEl?.removeEventListener('webkitbeginfullscreen', handleWebkitBegin);
      videoEl?.removeEventListener('webkitendfullscreen', handleWebkitEnd);
    };
  }, []);

  // 再生速度の変更（未完了の間は等速より速い再生＝早送りは不可）
  const handlePlaybackRateChange = (rate: number) => {
    if (skipLocked && rate > 1) {
      return;
    }
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
      setShowSpeedMenu(false);
    }
  };

  // メタデータ読み込み後、保存された再生速度を適用
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, duration]);

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
        // 一時停止時に進捗を保存
        saveProgress();
      } else {
        // バッファが十分でない場合は警告
        if (!isReadyToPlay && bufferProgress < 10) {
          alert('動画を読み込んでいます。もう少しお待ちください。\n現在の読み込み状況: ' + bufferProgress + '%');
          return;
        }

        // 再生開始時に親コンポーネントに通知（開始時刻を記録）
        if (onPlayStart) {
          onPlayStart();
        }
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
    const wasPlaying = videoRef.current && !videoRef.current.paused;

    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      setIsMuted(newVolume === 0);

      // 音量変更後も再生状態を維持
      if (wasPlaying && videoRef.current.paused) {
        console.log('[VideoPlayer] 音量変更後に再生を再開');
        videoRef.current.play().catch(err => {
          console.error('[VideoPlayer] 音量変更後の再生再開失敗:', err);
        });
      }
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
        // シーク後に進捗を保存
        saveProgress();
      } else if (newTime <= maxWatchedTime) {
        // 未完了でも既に視聴した範囲内ならシーク可能
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
        // シーク後に進捗を保存
        saveProgress();
      } else {
        alert('まだ視聴していない部分にはスキップできません。');
      }
    }
  };

  // ページ離脱時の進捗保存
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // 進捗がある場合、確認ダイアログを表示して保存
      if (videoRef.current && duration > 0 && currentTime > 0) {
        // 進捗を保存
        saveProgress();
        // 親コンポーネントにも通知（即座に保存）
        if (onBeforeUnload) {
          onBeforeUnload();
        }

        // 確認ダイアログを表示（ブラウザの標準機能）
        e.preventDefault();
        e.returnValue = '視聴進捗を保存しています。ページを離れますか？';
        return '視聴進捗を保存しています。ページを離れますか？';
      }
    };

    // 復帰時に再生を試みる共通処理（リトライ付き）
    const attemptResume = (label: string) => {
      const video = videoRef.current;
      if (!video) return;

      // 位置がリセットされていたら復元
      if (savedPositionBeforeBlur.current > 1) {
        const savedPos = savedPositionBeforeBlur.current;
        const currentPos = video.currentTime;
        if (Math.abs(currentPos - savedPos) > 5 || currentPos < 1) {
          video.currentTime = savedPos;
          setCurrentTime(savedPos);
          console.log(`[VideoPlayer] (${label}) 位置を復元: ${savedPos.toFixed(2)}秒 (前: ${currentPos.toFixed(2)}秒)`);
        }
      }

      // 復帰前が再生中だった場合のみ再開
      if (!wasPlayingBeforeBlurRef.current) return;
      if (!video.paused) return; // 既に再生中なら何もしない

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
            // autoplay policy で弾かれた場合は数回リトライ
            if (attempt < 3) {
              setTimeout(() => tryPlay(attempt + 1), 600);
            }
          });
      };
      // ブラウザの準備を待ってから実行
      setTimeout(() => tryPlay(1), 300);
    };

    const handleVisibilityChange = () => {
      const video = videoRef.current;
      if (!video) return;

      if (document.hidden) {
        // ページが非表示になる時
        if (duration > 0 && currentTime > 0) {
          const isPlayingNow = !video.paused;
          wasPlayingBeforeBlurRef.current = isPlayingNow;
          setWasPlayingBeforeBlur(isPlayingNow);
          savedPositionBeforeBlur.current = video.currentTime;
          console.log('[VideoPlayer] バックグラウンドへ移行:', {
            isPlaying: isPlayingNow ? '再生中' : '一時停止中',
            position: savedPositionBeforeBlur.current.toFixed(2),
          });
          saveProgress();
          if (onBeforeUnload) onBeforeUnload();
        }
      } else {
        // フォアグラウンド復帰
        console.log('[VideoPlayer] フォアグラウンドへ復帰');
        attemptResume('visibilitychange');
      }
    };

    // window focus でも再開を試みる（visibilitychange が発火しない一部ブラウザ向け）
    const handleWindowFocus = () => {
      if (!document.hidden) {
        attemptResume('focus');
      }
    };

    // bfcache から戻った場合の保険
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        console.log('[VideoPlayer] bfcache から復帰');
        attemptResume('pageshow');
      }
    };

    const handlePageHide = () => {
      if (videoRef.current && duration > 0 && currentTime > 0) {
        saveProgress();
        if (onBeforeUnload) onBeforeUnload();
      }
    };

    // 各種イベントリスナーを登録
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('pagehide', handlePageHide);

      // コンポーネントのアンマウント時に保存
      if (videoRef.current && duration > 0 && currentTime > 0) {
        saveProgress();
        if (onBeforeUnload) onBeforeUnload();
      }
    };
  }, [isPlaying, duration, currentTime, onBeforeUnload]);

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

  // 定期的なバッファチェック（再生中のみ）
  useEffect(() => {
    if (isPlaying && videoRef.current) {
      // 2秒ごとにバッファ状態をチェック
      bufferCheckInterval.current = setInterval(() => {
        updateBufferProgress();
      }, 2000);

      return () => {
        if (bufferCheckInterval.current) {
          clearInterval(bufferCheckInterval.current);
          bufferCheckInterval.current = null;
        }
      };
    }
  }, [isPlaying]);

  // コンポーネントのアンマウント時
  useEffect(() => {
    return () => {
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
      if (bufferCheckInterval.current) {
        clearInterval(bufferCheckInterval.current);
      }
      if (autoResumeTimeout.current) {
        clearTimeout(autoResumeTimeout.current);
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
        <div className="bg-white dark:bg-neutral-900 rounded-lg p-8 max-w-2xl mx-4 shadow-xl">
          <div className="flex items-center mb-4">
            <ExclamationTriangleIcon className="h-8 w-8 text-yellow-500 mr-3" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">視聴に関する重要な注意事項</h2>
          </div>

          <div className="space-y-4 mb-6">
            {/* 前回の続きから再生する場合の通知 */}
            {currentPosition > 0 && (
              <div className="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-400 p-4">
                <p className="font-semibold text-green-800 dark:text-green-200">
                  📍 前回の続きから再生します
                </p>
                <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                  前回視聴した位置: {formatTime(currentPosition)} から再開されます
                </p>
              </div>
            )}

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4">
              <p className="font-semibold text-yellow-800 dark:text-yellow-200">以下の点にご注意ください：</p>
              <ol className="list-decimal list-inside mt-2 space-y-2 text-yellow-800 dark:text-yellow-200">
                <li>動画の視聴は必ず就業時間内に行ってください。</li>
                <li>1回目の視聴のみ視聴ログを記録します。</li>
              </ol>
            </div>

            {/* スマホ専用の追加情報 */}
            {isMobile && (
              <div className="bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-400 p-4">
                <p className="font-semibold text-purple-800 dark:text-purple-300">📱 スマホで快適に視聴するために：</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-purple-700 dark:text-purple-200">
                  <li>Wi-Fi環境での視聴を強く推奨します</li>
                  <li>再生前に十分なバッファを確保します（60%または90秒先まで）</li>
                  <li>別のアプリに切り替えても、視聴位置は保持されます</li>
                  <li>バッファリング中は少々お待ちください</li>
                </ul>
              </div>
            )}
          </div>

          <div className="flex justify-center space-x-4">
            <button
              onClick={() => window.history.back()}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
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
        onClick={togglePlay}
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
          // 一時停止時に進捗を保存
          saveProgress();
        }}
        onWaiting={handleWaiting}
        onCanPlay={handleCanPlay}
        onCanPlayThrough={handleCanPlayThrough}
        onProgress={handleProgress}
        controlsList="nodownload"
        disablePictureInPicture={!isCompleted}
        preload="auto"
        playsInline
      />

      {/* 読み込み中のオーバーレイ */}
      {isBuffering && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-75 z-10">
          <div className="text-white text-center">
            {/* ローディングスピナー */}
            <div className="mb-4">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto"></div>
            </div>

            {/* 読み込みメッセージ */}
            <p className="text-lg mb-2">{loadingMessage}</p>

            {/* バッファ進捗バー */}
            {bufferProgress > 0 && (
              <div className="w-64 mx-auto">
                <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full transition-all duration-300"
                    style={{ width: `${bufferProgress}%` }}
                  />
                </div>
                <p className="text-sm mt-2 text-gray-300">
                  {bufferProgress}% 読み込み済み
                </p>
              </div>
            )}

            {/* デバイス別のヒント */}
            {isMobile ? (
              <div className="text-xs text-gray-400 mt-4 max-w-xs space-y-2">
                <p className="font-semibold text-yellow-400">📱 スマホで視聴中</p>
                <p>
                  より快適な視聴のため、{bufferProgress >= 60 ? '90秒' : '60%'}以上のバッファを確保しています。
                </p>
                <p>
                  Wi-Fi環境での視聴を強く推奨します。
                  <br />
                  別のアプリを開いても、戻ると自動的に再生が再開されます。
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-400 mt-4 max-w-xs">
                動画が大きい場合、読み込みに時間がかかることがあります。
                <br />
                Wi-Fi環境での視聴を推奨します。
              </p>
            )}
          </div>
        </div>
      )}

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

            {/* 再生速度ボタン */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu((v) => !v)}
                className="px-2 py-1 hover:bg-white/20 rounded transition-colors text-xs sm:text-sm font-semibold min-w-[2.5rem]"
                title="再生速度"
                aria-label="再生速度"
              >
                {playbackRate}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-black/90 rounded-lg overflow-hidden shadow-lg min-w-[5rem] z-20">
                  {playbackRateOptions.map((rate) => {
                    const rateLocked = skipLocked && rate > 1;
                    return (
                      <button
                        key={rate}
                        onClick={() => handlePlaybackRateChange(rate)}
                        disabled={rateLocked}
                        title={rateLocked ? '視聴完了後に利用できます' : undefined}
                        className={`block w-full text-left px-3 py-2 text-xs sm:text-sm transition-colors ${
                          rateLocked
                            ? 'text-gray-500 cursor-not-allowed'
                            : rate === playbackRate
                            ? 'text-blue-400 font-semibold hover:bg-white/20'
                            : 'text-white hover:bg-white/20'
                        }`}
                      >
                        {rate}x{rate === 1 ? ' (標準)' : ''}{rateLocked ? ' 🔒' : ''}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* フルスクリーンボタン */}
            <button
              onClick={toggleFullscreen}
              className="p-1 hover:bg-white/20 rounded transition-colors"
              title={isFullscreen ? "全画面を終了" : "全画面表示"}
              aria-label={isFullscreen ? "全画面を終了" : "全画面表示"}
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