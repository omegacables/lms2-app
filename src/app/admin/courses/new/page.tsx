'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import { 
  ArrowLeftIcon,
  CloudArrowUpIcon,
  XMarkIcon,
  PlayIcon,
  DocumentIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

interface VideoFile {
  id: string;
  file: File;
  title: string;
  description: string;
  duration?: number;
  uploadProgress: number;
  uploaded: boolean;
  error?: string;
}

export default function CreateCoursePage() {
  const { user, devBypassAuth } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    difficulty_level: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    completion_threshold: 80,
  });

  // 認証チェックと開発用バイパス
  useEffect(() => {
    const checkAuth = async () => {
      if (!user) {
        console.log('[CreateCoursePage] No authenticated user, attempting dev bypass');
        try {
          const result = await devBypassAuth();
          if (result.error) {
            console.error('[CreateCoursePage] Dev bypass failed:', result.error);
          } else {
            console.log('[CreateCoursePage] Dev bypass successful');
          }
        } catch (error) {
          console.error('[CreateCoursePage] Dev bypass error:', error);
        }
      }
      setAuthChecked(true);
    };
    
    checkAuth();
  }, [user, devBypassAuth]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const videoFiles = files.filter(file => file.type.startsWith('video/'));
    
    videoFiles.forEach(file => {
      const videoFile: VideoFile = {
        id: Math.random().toString(36).substr(2, 9),
        file,
        title: file.name.replace(/\.[^/.]+$/, ''),
        description: '',
        uploadProgress: 0,
        uploaded: false,
      };
      
      setVideos(prev => [...prev, videoFile]);
      
      // Get video duration
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        setVideos(prev => prev.map(v => 
          v.id === videoFile.id 
            ? { ...v, duration: Math.floor(video.duration) }
            : v
        ));
      };
      video.src = URL.createObjectURL(file);
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const videoFiles = files.filter(file => file.type.startsWith('video/'));
    
    videoFiles.forEach(file => {
      const videoFile: VideoFile = {
        id: Math.random().toString(36).substr(2, 9),
        file,
        title: file.name.replace(/\.[^/.]+$/, ''),
        description: '',
        uploadProgress: 0,
        uploaded: false,
      };
      
      setVideos(prev => [...prev, videoFile]);
    });
  };

  const removeVideo = (id: string) => {
    setVideos(prev => prev.filter(v => v.id !== id));
  };

  const updateVideoInfo = (id: string, field: keyof VideoFile, value: any) => {
    setVideos(prev => prev.map(v => 
      v.id === id ? { ...v, [field]: value } : v
    ));
  };

  const uploadVideo = async (videoFile: VideoFile, courseId: number) => {
    try {
      console.log('Starting upload for:', videoFile.file.name, 'Size:', videoFile.file.size);
      
      setVideos(prev => prev.map(v => 
        v.id === videoFile.id ? { ...v, uploadProgress: 10 } : v
      ));

      // Check if user is authenticated first
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('認証が必要です。再度ログインしてください。');
      }

      // Upload using API endpoint with XMLHttpRequest for progress tracking
      return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('video', videoFile.file);
        formData.append('title', videoFile.title);
        formData.append('description', videoFile.description || '');
        formData.append('duration', String(videoFile.duration || 0));
        formData.append('order_index', '0');

        const xhr = new XMLHttpRequest();

        // Progress tracking
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            setVideos(prev => prev.map(v => 
              v.id === videoFile.id 
                ? { ...v, uploadProgress: Math.round(percentComplete) }
                : v
            ));
          }
        });

        // Handle completion
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText);
            console.log('Upload successful:', response);
            
            setVideos(prev => prev.map(v => 
              v.id === videoFile.id 
                ? { ...v, uploaded: true, uploadProgress: 100 }
                : v
            ));

            resolve({
              filename: response.video?.file_url || '',
              url: response.video?.file_url || '',
              title: videoFile.title,
              description: videoFile.description,
              duration: videoFile.duration || 0,
              videoId: response.video?.id
            });
          } else {
            const error = xhr.responseText ? JSON.parse(xhr.responseText) : { error: 'アップロードに失敗しました' };
            reject(new Error(error.error || 'アップロードに失敗しました'));
          }
        });

        // Handle errors
        xhr.addEventListener('error', () => {
          reject(new Error('ネットワークエラーが発生しました'));
        });

        xhr.addEventListener('timeout', () => {
          reject(new Error('アップロードがタイムアウトしました'));
        });

        // Configure and send
        xhr.open('POST', `/api/courses/${courseId}/videos`);
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
        xhr.timeout = 300000; // 5分のタイムアウト
        xhr.send(formData);
      });

    } catch (error) {
      console.error('Video upload error:', error);
      setVideos(prev => prev.map(v => 
        v.id === videoFile.id 
          ? { ...v, error: (error as Error).message, uploadProgress: 0 }
          : v
      ));
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (videos.length === 0) {
      alert('少なくとも1つの動画を追加してください。');
      return;
    }

    if (!user) {
      alert('認証エラー: ログインしてください。');
      return;
    }

    if (!user.id) {
      alert('ユーザー情報の取得に失敗しました。再度ログインしてください。');
      return;
    }

    setLoading(true);
    
    try {
      console.log('Creating course with user ID:', user.id);
      // Create course
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .insert([
          {
            title: formData.title,
            description: formData.description,
            category: formData.category,
            difficulty_level: formData.difficulty_level,
            completion_threshold: formData.completion_threshold,
            created_by: user?.id,
            status: 'inactive', // Start as inactive until videos are uploaded
          }
        ])
        .select()
        .single();

      if (courseError) {
        throw courseError;
      }

      // Upload videos - API endpoint will handle database insertion
      const videoPromises = videos.map(async (video, index) => {
        const uploadResult = await uploadVideo(video, courseData.id);
        if (!uploadResult) return null;
        
        // API endpoint already creates the video record, just return the result
        return uploadResult;
      });

      const videoResults = await Promise.all(videoPromises);
      const successfulUploads = videoResults.filter(result => result !== null);

      if (successfulUploads.length > 0) {
        // Update course status to active
        await supabase
          .from('courses')
          .update({ status: 'active' })
          .eq('id', courseData.id);

        alert(`コース "${formData.title}" が正常に作成されました。${successfulUploads.length}個の動画がアップロードされました。`);
        router.push('/admin/courses');
      } else {
        throw new Error('動画のアップロードに失敗しました。');
      }

    } catch (error) {
      console.error('Course creation error:', error);
      alert(`エラーが発生しました: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // 認証チェックが完了していない場合はローディング表示
  if (!authChecked) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="flex justify-center items-center min-h-64">
            <LoadingSpinner size="lg" />
            <span className="ml-4">認証を確認中...</span>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center space-x-4 mb-4">
              <Link 
                href="/admin/courses"
                className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">新規コース作成</h1>
                <p className="text-gray-600 dark:text-gray-400">新しいコースを作成し、動画コンテンツをアップロードします</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Course Information */}
            <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">コース情報</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <Input
                    label="コースタイトル"
                    placeholder="例: JavaScript入門講座"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
                
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    コースの説明
                  </label>
                  <textarea
                    rows={4}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                    placeholder="コースの内容や学習目標を説明してください"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <Input
                    label="カテゴリ"
                    placeholder="例: プログラミング"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    難易度レベル
                  </label>
                  <select
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                    value={formData.difficulty_level}
                    onChange={(e) => setFormData({ ...formData, difficulty_level: e.target.value as any })}
                  >
                    <option value="beginner">初級</option>
                    <option value="intermediate">中級</option>
                    <option value="advanced">上級</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    完了閾値 (%)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                    value={formData.completion_threshold}
                    onChange={(e) => setFormData({ ...formData, completion_threshold: parseInt(e.target.value) })}
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    この値を超えるとコース完了と判定されます
                  </p>
                </div>
              </div>
            </div>

            {/* Video Upload */}
            <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">動画コンテンツ</h2>
              
              {/* Drop Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  dragOver 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                }`}
              >
                <CloudArrowUpIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  動画ファイルをドラッグ&ドロップ
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  または、クリックしてファイルを選択
                </p>
                <input
                  type="file"
                  multiple
                  accept="video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="video-upload"
                />
                <label
                  htmlFor="video-upload"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors"
                >
                  ファイルを選択
                </label>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  対応形式: MP4, WebM, AVI (最大500MB)
                </p>
              </div>

              {/* Video List */}
              {videos.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-md font-semibold text-gray-900 dark:text-white mb-4">
                    アップロード予定の動画 ({videos.length}件)
                  </h3>
                  <div className="space-y-4">
                    {videos.map((video) => (
                      <div key={video.id} className="border border-gray-200 dark:border-neutral-800 rounded-lg p-4">
                        <div className="flex items-start space-x-4">
                          <div className="flex-shrink-0">
                            <div className="w-16 h-12 bg-gray-100 dark:bg-neutral-900 rounded-lg flex items-center justify-center">
                              {video.uploaded ? (
                                <CheckCircleIcon className="h-6 w-6 text-green-600" />
                              ) : video.error ? (
                                <XMarkIcon className="h-6 w-6 text-red-600" />
                              ) : (
                                <PlayIcon className="h-6 w-6 text-gray-400" />
                              )}
                            </div>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Input
                                  label="動画タイトル"
                                  value={video.title}
                                  onChange={(e) => updateVideoInfo(video.id, 'title', e.target.value)}
                                  placeholder="動画のタイトルを入力"
                                />
                              </div>
                              <div>
                                <Input
                                  label="説明"
                                  value={video.description}
                                  onChange={(e) => updateVideoInfo(video.id, 'description', e.target.value)}
                                  placeholder="動画の説明を入力"
                                />
                              </div>
                            </div>
                            
                            <div className="mt-3 flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                              <span className="flex items-center">
                                <DocumentIcon className="h-4 w-4 mr-1" />
                                {formatFileSize(video.file.size)}
                              </span>
                              {video.duration && (
                                <span>⏱️ {formatDuration(video.duration)}</span>
                              )}
                              <span>🎬 {video.file.type}</span>
                            </div>
                            
                            {/* Upload Progress */}
                            {video.uploadProgress > 0 && video.uploadProgress < 100 && (
                              <div className="mt-3">
                                <div className="flex items-center justify-between text-sm mb-1">
                                  <span className="text-gray-600 dark:text-gray-400">アップロード中...</span>
                                  <span className="text-gray-600 dark:text-gray-400">{video.uploadProgress}%</span>
                                </div>
                                <div className="bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-blue-600 rounded-full h-2 transition-all duration-300"
                                    style={{ width: `${video.uploadProgress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                            
                            {/* Error Message */}
                            {video.error && (
                              <div className="mt-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                                エラー: {video.error}
                              </div>
                            )}
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => removeVideo(video.id)}
                            className="flex-shrink-0 p-1 text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <XMarkIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="flex justify-end space-x-4">
              <Link href="/admin/courses">
                <Button variant="outline">
                  キャンセル
                </Button>
              </Link>
              <Button 
                type="submit" 
                loading={loading}
                disabled={loading || videos.length === 0}
              >
                {loading ? 'コース作成中...' : 'コースを作成'}
              </Button>
            </div>
          </form>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}