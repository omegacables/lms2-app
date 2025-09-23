'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import {
  ArrowLeftIcon,
  PlayIcon,
  PauseIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  ArrowsPointingOutIcon,
  ForwardIcon,
  BackwardIcon,
  AdjustmentsHorizontalIcon,
  ChatBubbleLeftRightIcon,
  BookOpenIcon,
  CheckCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import {
  CheckCircleIcon as CheckCircleIconSolid
} from '@heroicons/react/24/solid';

interface Video {
  id: string;
  title: string;
  description: string;
  file_url: string;
  duration: number;
  course_id: string;
  order_index: number;
}

interface Course {
  id: string;
  title: string;
  description: string;
}

interface VideoProgress {
  progress: number;
  total_watched_time: number;
  status: 'not_started' | 'in_progress' | 'completed';
  last_position: number;
}


export default function VideoPlayerPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const videoId = params.id as string;
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [courseVideos, setCourseVideos] = useState<Video[]>([]);
  const [videoProgress, setVideoProgress] = useState<VideoProgress>({
    progress: 0,
    total_watched_time: 0,
    status: 'not_started',
    last_position: 0
  });
  
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  
  // Progress tracking
  const lastUpdateRef = useRef<number>(0);
  const watchTimeRef = useRef<number>(0);

  useEffect(() => {
    if (videoId) {
      fetchVideo();
    }
  }, [videoId]);

  useEffect(() => {
    if (video?.course_id) {
      fetchCourse();
      fetchCourseVideos();
      fetchVideoProgress();
    }
  }, [video]);

  useEffect(() => {
    // Load last position when video is ready
    if (videoRef.current && videoProgress.last_position > 0) {
      videoRef.current.currentTime = videoProgress.last_position;
    }
  }, [videoProgress.last_position, video]);

  const fetchVideo = async () => {
    try {
      setLoading(true);
      
      const { data: videoData, error: videoError } = await supabase
        .from('videos')
        .select('*')
        .eq('id', videoId)
        .single();

      if (videoError) {
        console.error('動画取得エラー:', videoError);
        return;
      }

      setVideo(videoData);
    } catch (error) {
      console.error('動画取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCourse = async () => {
    if (!video?.course_id) return;
    
    try {
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('id, title, description')
        .eq('id', video.course_id)
        .single();

      if (courseError) {
        console.error('コース取得エラー:', courseError);
        return;
      }

      setCourse(courseData);
    } catch (error) {
      console.error('コース取得エラー:', error);
    }
  };

  const fetchCourseVideos = async () => {
    if (!video?.course_id) return;
    
    try {
      const { data: videosData, error: videosError } = await supabase
        .from('videos')
        .select('id, title, order_index, duration')
        .eq('course_id', video.course_id)
        .eq('status', 'active')
        .order('order_index', { ascending: true });

      if (videosError) {
        console.error('コース動画取得エラー:', videosError);
        return;
      }

      setCourseVideos(videosData || []);
    } catch (error) {
      console.error('コース動画取得エラー:', error);
    }
  };

  const fetchVideoProgress = async () => {
    if (!user?.id || !videoId) return;
    
    try {
      const { data: progressData, error: progressError } = await supabase
        .from('video_view_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('video_id', videoId)
        .single();

      if (progressError && progressError.code !== 'PGRST116') {
        console.error('進捗取得エラー:', progressError);
        return;
      }

      if (progressData) {
        setVideoProgress({
          progress: progressData.progress || 0,
          total_watched_time: progressData.total_watched_time || 0,
          status: progressData.status || 'not_started',
          last_position: progressData.last_position || 0
        });
        watchTimeRef.current = progressData.total_watched_time || 0;
      }
    } catch (error) {
      console.error('進捗取得エラー:', error);
    }
  };

  const updateProgress = async () => {
    if (!user?.id || !videoId || !video) return;
    
    const currentProgress = duration > 0 ? (currentTime / duration) * 100 : 0;
    const status = currentProgress >= 90 ? 'completed' : currentProgress > 0 ? 'in_progress' : 'not_started';
    const now = new Date().toISOString();
    
    try {
      const { error } = await supabase
        .from('video_view_logs')
        .upsert({
          user_id: user.id,
          video_id: videoId,
          course_id: video.course_id,
          progress: currentProgress,
          total_watched_time: watchTimeRef.current,
          last_position: currentTime,
          status,
          start_time: videoProgress.last_position === 0 ? now : undefined, // 初回のみ開始時間記録
          end_time: status === 'completed' ? now : null, // 90%完了時に終了時間記録
          last_updated: now
        }, {
          onConflict: 'user_id,video_id'
        });

      if (error) {
        console.error('進捗更新エラー:', error);
      } else {
        // 90%完了時の通知
        if (status === 'completed' && videoProgress.status !== 'completed') {
          console.log(`動画「${video.title}」を完了しました！`);
        }
        
        setVideoProgress({
          progress: currentProgress,
          total_watched_time: watchTimeRef.current,
          status,
          last_position: currentTime
        });
      }
    } catch (error) {
      console.error('進捗更新エラー:', error);
    }
  };

  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play();
      setPlaying(true);
      lastUpdateRef.current = Date.now();
    }
  };

  const handlePause = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      setPlaying(false);
      
      // Update watch time
      if (lastUpdateRef.current > 0) {
        const sessionTime = (Date.now() - lastUpdateRef.current) / 1000;
        watchTimeRef.current += sessionTime;
        updateProgress();
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      
      // Update progress every 10 seconds while playing
      if (playing && Date.now() - lastUpdateRef.current > 10000) {
        const sessionTime = (Date.now() - lastUpdateRef.current) / 1000;
        watchTimeRef.current += sessionTime;
        updateProgress();
        lastUpdateRef.current = Date.now();
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      setVolume(newVolume);
    }
  };

  const handlePlaybackRateChange = (rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
  };

  const toggleFullscreen = () => {
    if (!fullscreen) {
      if (videoRef.current?.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
    setFullscreen(!fullscreen);
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getNextVideo = () => {
    const currentIndex = courseVideos.findIndex(v => v.id === videoId);
    return currentIndex < courseVideos.length - 1 ? courseVideos[currentIndex + 1] : null;
  };

  const getPrevVideo = () => {
    const currentIndex = courseVideos.findIndex(v => v.id === videoId);
    return currentIndex > 0 ? courseVideos[currentIndex - 1] : null;
  };

  if (loading) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="flex justify-center items-center min-h-64">
            <LoadingSpinner size="lg" />
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  if (!video) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">動画が見つかりません</h2>
            <Link href="/my-courses">
              <Button>マイコースに戻る</Button>
            </Link>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Main Video Player */}
            <div className="lg:col-span-3">
              {/* Video Player */}
              <div className="bg-black rounded-xl overflow-hidden mb-6 relative group">
                <video
                  ref={videoRef}
                  className="w-full aspect-video"
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={handlePause}
                  poster="/api/placeholder/800/450"
                >
                  <source src={video.file_url} type="video/mp4" />
                  お使いのブラウザは動画の再生に対応していません。
                </video>
                
                {/* Video Controls Overlay */}
                {showControls && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                    {/* Progress Bar */}
                    <div className="mb-4">
                      <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900/20 rounded-full h-1 cursor-pointer"
                           onClick={(e) => {
                             const rect = e.currentTarget.getBoundingClientRect();
                             const percent = (e.clientX - rect.left) / rect.width;
                             handleSeek(duration * percent);
                           }}>
                        <div 
                          className="bg-blue-50 dark:bg-blue-900/200 rounded-full h-1 transition-all"
                          style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-white text-xs mt-1">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                    </div>
                    
                    {/* Controls */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <button onClick={playing ? handlePause : handlePlay}
                                className="text-white hover:text-blue-400 transition-colors">
                          {playing ? (
                            <PauseIcon className="h-8 w-8" />
                          ) : (
                            <PlayIcon className="h-8 w-8" />
                          )}
                        </button>
                        
                        <div className="flex items-center space-x-2">
                          <button onClick={() => setMuted(!muted)}
                                  className="text-white hover:text-blue-400 transition-colors">
                            {muted ? (
                              <SpeakerXMarkIcon className="h-5 w-5" />
                            ) : (
                              <SpeakerWaveIcon className="h-5 w-5" />
                            )}
                          </button>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={muted ? 0 : volume}
                            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                            className="w-20 accent-blue-500"
                          />
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <select
                          value={playbackRate}
                          onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                          className="bg-black/50 text-white text-sm rounded px-2 py-1 border-none"
                        >
                          <option value={0.5}>0.5x</option>
                          <option value={0.75}>0.75x</option>
                          <option value={1}>1x</option>
                          <option value={1.25}>1.25x</option>
                          <option value={1.5}>1.5x</option>
                          <option value={2}>2x</option>
                        </select>
                        
                        <button onClick={toggleFullscreen}
                                className="text-white hover:text-blue-400 transition-colors">
                          <ArrowsPointingOutIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Video Info */}
              <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6 mb-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{video.title}</h1>
                    <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400 mb-4">
                      <span className="flex items-center">
                        <ClockIcon className="h-4 w-4 mr-1" />
                        {formatTime(video.duration)}
                      </span>
                      <span className="flex items-center">
                        <CheckCircleIconSolid className={`h-4 w-4 mr-1 ${
                          videoProgress.status === 'completed' ? 'text-green-500' : 'text-gray-400'
                        }`} />
                        進捗: {Math.round(videoProgress.progress)}%
                      </span>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400">{video.description}</p>
                  </div>
                </div>
                
                {/* Navigation */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-neutral-800">
                  <div>
                    {getPrevVideo() && (
                      <Link href={`/videos/${getPrevVideo()?.id}`}>
                        <Button variant="outline">
                          <BackwardIcon className="h-4 w-4 mr-2" />
                          前の動画
                        </Button>
                      </Link>
                    )}
                  </div>
                  <div>
                    {getNextVideo() && (
                      <Link href={`/videos/${getNextVideo()?.id}`}>
                        <Button>
                          次の動画
                          <ForwardIcon className="h-4 w-4 ml-2" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Sidebar */}
            <div className="space-y-6">
              {/* Course Info */}
              {course && (
                <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-4">
                  <div className="flex items-center mb-3">
                    <BookOpenIcon className="h-5 w-5 text-blue-600 mr-2" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">コース</h3>
                  </div>
                  <Link href={`/my-courses`} className="block hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg p-2 -m-2">
                    <div className="font-medium text-blue-600">{course.title}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{course.description}</div>
                  </Link>
                </div>
              )}
              
              {/* Video List */}
              <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">動画一覧</h3>
                <div className="space-y-2">
                  {courseVideos.map((courseVideo, index) => (
                    <Link
                      key={courseVideo.id}
                      href={`/videos/${courseVideo.id}`}
                      className={`block p-3 rounded-lg transition-colors ${
                        courseVideo.id === videoId
                          ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium ${
                            courseVideo.id === videoId
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-200 text-gray-600 dark:text-gray-400'
                          }`}>
                            {index + 1}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium truncate ${
                            courseVideo.id === videoId ? 'text-blue-900' : 'text-gray-900 dark:text-white'
                          }`}>
                            {courseVideo.title}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {formatTime(courseVideo.duration)}
                          </div>
                        </div>
                        {courseVideo.id === videoId && (
                          <PlayIcon className="h-4 w-4 text-blue-600 flex-shrink-0" />
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}