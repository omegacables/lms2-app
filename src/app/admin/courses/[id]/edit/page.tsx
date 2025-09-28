'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
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
  DocumentIcon,
  VideoCameraIcon,
  TrashIcon,
  PencilIcon,
  PhotoIcon,
  CloudArrowUpIcon,
  BookOpenIcon
} from '@heroicons/react/24/outline';

interface Course {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  completion_threshold: number;
  status: 'active' | 'inactive';
  thumbnail_url: string;
  thumbnail_file_path: string;
  created_at: string;
  updated_at: string;
}

interface Video {
  id: string;
  title: string;
  description: string;
  duration: number;
  order_index: number;
  file_url: string;
  status: 'active' | 'inactive';
}


export default function EditCoursePage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const courseId = params.id as string;
  
  const [course, setCourse] = useState<Course | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string>('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    difficulty_level: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    completion_threshold: 80,
    status: 'active' as 'active' | 'inactive'
  });

  useEffect(() => {
    if (courseId) {
      fetchCourse();
      fetchVideos();
    }
  }, [courseId]);

  const fetchCourse = async () => {
    try {
      setLoading(true);
      
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (courseError) {
        console.error('コース取得エラー:', courseError);
        alert('コースの取得に失敗しました');
        return;
      }

      setCourse(courseData);
      setFormData({
        title: courseData.title || '',
        description: courseData.description || '',
        category: courseData.category || '',
        difficulty_level: courseData.difficulty_level || 'beginner',
        completion_threshold: courseData.completion_threshold || 80,
        status: courseData.status || 'active'
      });
      
      // Set thumbnail preview if exists
      if (courseData.thumbnail_url) {
        setThumbnailPreview(courseData.thumbnail_url);
      }
    } catch (error) {
      console.error('コース取得エラー:', error);
      alert('コースの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const fetchVideos = async () => {
    try {
      const { data: videosData, error: videosError } = await supabase
        .from('videos')
        .select('*')
        .eq('course_id', courseId)
        .order('order_index', { ascending: true });

      if (videosError) {
        console.error('動画取得エラー:', videosError);
        return;
      }

      setVideos(videosData || []);
    } catch (error) {
      console.error('動画取得エラー:', error);
    }
  };

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('画像ファイルを選択してください。');
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      alert('ファイルサイズは5MB以下にしてください。');
      return;
    }

    setThumbnailFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setThumbnailPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const uploadThumbnail = async () => {
    if (!thumbnailFile || !courseId) return null;

    try {
      setUploading(true);
      
      // 現在のセッションを取得
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('セッションが見つかりません。再度ログインしてください。');
      }

      // 現在のユーザーのロールを確認
      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      console.log('Current user profile:', userProfile, 'Error:', profileError);

      if (profileError || !userProfile) {
        throw new Error('ユーザープロファイルが見つかりません');
      }

      if (userProfile.role !== 'admin' && userProfile.role !== 'instructor') {
        throw new Error(`アップロード権限がありません。現在のロール: ${userProfile.role || '未設定'}`);
      }
      
      // FormDataを作成
      const formData = new FormData();
      formData.append('file', thumbnailFile);

      // APIルートを使用してアップロード（認証情報を含める）
      const response = await fetch(`/api/courses/${courseId}/upload-thumbnail`, {
        method: 'POST',
        body: formData,
        credentials: 'include', // クッキーを含める
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Upload error response:', result);
        throw new Error(result.error || 'アップロードに失敗しました');
      }

      return {
        url: result.url,
        filePath: result.filePath
      };
    } catch (error) {
      console.error('サムネイル画像アップロードエラー:', error);
      throw error;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.id) {
      alert('認証エラー: ログインしてください');
      return;
    }

    setSaving(true);
    
    try {
      let updateData = {
        title: formData.title,
        description: formData.description,
        category: formData.category,
        difficulty_level: formData.difficulty_level,
        completion_threshold: formData.completion_threshold,
        status: formData.status,
        updated_at: new Date().toISOString()
      };

      // Upload thumbnail if changed (APIルートが自動的にコース情報も更新する)
      if (thumbnailFile) {
        try {
          await uploadThumbnail();
          // APIルートがコースのサムネイルURLも更新するので、ここでは更新不要
        } catch (uploadError) {
          console.error('サムネイルアップロードエラー:', uploadError);
          alert(`画像のアップロードに失敗しました: ${uploadError instanceof Error ? uploadError.message : 'エラーが発生しました'}`);
          // 画像アップロードが失敗してもコース情報は保存する
        }
      }

      // コース基本情報を更新（サムネイル以外）
      const { error } = await supabase
        .from('courses')
        .update(updateData)
        .eq('id', courseId);

      if (error) {
        throw error;
      }

      alert('コースが正常に更新されました');
      router.push('/admin/courses');
    } catch (error) {
      console.error('コース更新エラー:', error);
      alert(`エラーが発生しました: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    if (!confirm('この動画を削除してもよろしいですか？')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('videos')
        .delete()
        .eq('id', videoId);

      if (error) {
        throw error;
      }

      setVideos(prev => prev.filter(v => v.id !== videoId));
      alert('動画が削除されました');
    } catch (error) {
      console.error('動画削除エラー:', error);
      alert('動画の削除に失敗しました');
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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

  if (!course) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">コースが見つかりません</h2>
            <Link href="/admin/courses">
              <Button>コース一覧に戻る</Button>
            </Link>
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
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">コース編集</h1>
                <p className="text-gray-600 dark:text-gray-400">コースの基本情報と動画を管理します</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Course Information */}
                <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">基本情報</h2>
                  <div className="space-y-4">
                    
                    {/* Thumbnail Upload */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        コース画像
                      </label>
                      <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0">
                          {thumbnailPreview ? (
                            <img
                              src={thumbnailPreview}
                              alt="Course thumbnail"
                              className="w-24 h-24 object-cover rounded-lg border border-gray-300 dark:border-gray-600"
                            />
                          ) : (
                            <div className="w-24 h-24 bg-gray-100 dark:bg-neutral-900 rounded-lg border border-gray-300 dark:border-gray-600 flex items-center justify-center">
                              <PhotoIcon className="h-8 w-8 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleThumbnailChange}
                            className="hidden"
                            id="thumbnail-upload"
                          />
                          <label
                            htmlFor="thumbnail-upload"
                            className="cursor-pointer inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-neutral-900 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            <CloudArrowUpIcon className="h-4 w-4 mr-2" />
                            {thumbnailPreview ? '画像を変更' : '画像を選択'}
                          </label>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            JPG, PNG, GIF (最大5MB)
                          </p>
                        </div>
                      </div>
                    </div>
                    <Input
                      label="コースタイトル"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                    />
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        コースの説明
                      </label>
                      <textarea
                        rows={4}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="カテゴリ"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      />

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
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          ステータス
                        </label>
                        <select
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                          value={formData.status}
                          onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                        >
                          <option value="active">公開</option>
                          <option value="inactive">非公開</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end space-x-4">
                  <Link href="/admin/courses">
                    <Button variant="outline">キャンセル</Button>
                  </Link>
                  <Button type="submit" loading={saving || uploading}>
                    {uploading ? '画像をアップロード中...' : saving ? '保存中...' : '変更を保存'}
                  </Button>
                </div>
              </form>

              {/* Chapters Management Link */}
              <div className="mt-8 bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">章管理</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  このコースの章構成を管理します。章の追加、編集、削除、動画の割り当てが可能です。
                </p>
                <Link
                  href={`/admin/courses/${courseId}/chapters`}
                  className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-neutral-900 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <BookOpenIcon className="h-4 w-4 mr-2" />
                  章を管理
                </Link>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Course Stats */}
              <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">コース統計</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">動画数</span>
                    <span className="text-sm font-medium">{videos.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">総再生時間</span>
                    <span className="text-sm font-medium">
                      {formatDuration(videos.reduce((sum, v) => sum + (v.duration || 0), 0))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">作成日</span>
                    <span className="text-sm font-medium">
                      {new Date(course.created_at).toLocaleDateString('ja-JP')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">アクション</h3>
                <div className="space-y-3">
                  <Link
                    href={`/admin/courses/${courseId}/videos`}
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-neutral-900 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <VideoCameraIcon className="h-4 w-4 mr-2" />
                    動画を管理
                  </Link>
                  <Link
                    href="/admin/courses"
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-neutral-900 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <DocumentIcon className="h-4 w-4 mr-2" />
                    コース一覧に戻る
                  </Link>
                </div>
              </div>

              {/* Videos List */}
              <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">動画一覧</h3>
                  <Link
                    href={`/admin/courses/${courseId}/videos`}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-neutral-900 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    動画を管理
                  </Link>
                </div>
                {videos.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">動画がまだありません</p>
                ) : (
                  <div className="space-y-2">
                    {videos.slice(0, 5).map((video) => (
                      <div key={video.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-black rounded-lg">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {video.title}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDuration(video.duration)}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteVideo(video.id)}
                          className="ml-2 p-1 text-red-500 hover:text-red-700"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {videos.length > 5 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-2">
                        他 {videos.length - 5} 件
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}