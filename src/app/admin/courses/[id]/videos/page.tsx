'use client';

import { useState, useEffect, useCallback } from 'react';
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
  validateVideoFile,
  formatFileSize
} from '@/utils/supabase-storage';
import {
  ArrowLeftIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  ClockIcon,
  VideoCameraIcon,
  ArrowsUpDownIcon,
  ArrowUpTrayIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';

interface Course {
  id: string;
  title: string;
  description: string;
  thumbnail_url?: string;
}

interface Video {
  id: string;
  title: string;
  description: string;
  duration: number;
  order_index: number;
  file_url: string;
  file_size: number;
  mime_type: string;
  status: 'active' | 'inactive';
  created_at: string;
  file_path?: string;
}


export default function CourseVideosPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const courseId = params.id as string;
  
  const [course, setCourse] = useState<Course | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingVideo, setEditingVideo] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    order_index: 1,
    status: 'active' as 'active' | 'inactive'
  });

  // 動画追加用の状態
  const [showAddModal, setShowAddModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [addForm, setAddForm] = useState({
    title: '',
    description: '',
    order_index: 1,
    status: 'active' as 'active' | 'inactive'
  });

  // リソース追加用の状態
  interface ResourceToAdd {
    type: 'material' | 'assignment' | 'reference' | 'explanation';
    title: string;
    description?: string;
    content?: string;
    file?: File;
    is_required?: boolean;
  }
  const [resourcesToAdd, setResourcesToAdd] = useState<ResourceToAdd[]>([]);
  const [activeAddTab, setActiveAddTab] = useState<'basic' | 'resources'>('basic');

  // 動画置き換え用の状態
  const [replacingVideo, setReplacingVideo] = useState<string | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  // ドラッグ&ドロップ用の状態
  const [draggedVideo, setDraggedVideo] = useState<Video | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (courseId) {
      fetchCourse();
      fetchVideos();
    }
  }, [courseId]);

  useEffect(() => {
    if (showAddModal) {
      setAddForm(prev => ({
        ...prev,
        order_index: videos.length + 1
      }));
    }
  }, [showAddModal, videos.length]);

  const fetchCourse = async () => {
    try {
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('id, title, description, thumbnail_url')
        .eq('id', courseId)
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

  const fetchVideos = async () => {
    try {
      setLoading(true);
      
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
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    if (!confirm('この動画を削除してもよろしいですか？\\n削除された動画は復元できません。')) {
      return;
    }

    try {
      // Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('認証が必要です。再度ログインしてください。');
      }

      // APIエンドポイント経由で削除
      const response = await fetch(`/api/courses/${courseId}/videos/${videoId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '削除に失敗しました');
      }

      setVideos(prev => prev.filter(v => v.id !== videoId));
      alert('動画が削除されました');
    } catch (error) {
      console.error('動画削除エラー:', error);
      alert(`動画の削除に失敗しました: ${(error as Error).message}`);
    }
  };

  const handleEditVideo = (video: Video) => {
    setEditingVideo(video.id);
    setEditForm({
      title: video.title,
      description: video.description,
      order_index: video.order_index,
      status: video.status
    });
  };

  const handleSaveEdit = async () => {
    if (!editingVideo) return;

    try {
      const { error } = await supabase
        .from('videos')
        .update({
          title: editForm.title,
          description: editForm.description,
          order_index: editForm.order_index,
          status: editForm.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingVideo);

      if (error) {
        throw error;
      }

      await fetchVideos();
      setEditingVideo(null);
      alert('動画情報が更新されました');
    } catch (error) {
      console.error('動画更新エラー:', error);
      alert('動画の更新に失敗しました');
    }
  };

  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>, isReplace: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateVideoFile(file);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    if (isReplace) {
      setReplaceFile(file);
    } else {
      setVideoFile(file);
      if (!addForm.title) {
        const fileName = file.name.split('.').slice(0, -1).join('.');
        setAddForm(prev => ({ ...prev, title: fileName }));
      }
    }
  };

  const handleThumbnailFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('画像ファイルを選択してください。');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('ファイルサイズは10MB以下にしてください。');
      return;
    }

    setThumbnailFile(file);
  };

  // 動画の長さを取得するヘルパー関数
  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        resolve(Math.round(video.duration));
      };
      video.onerror = () => {
        reject(new Error('動画のメタデータを読み込めませんでした'));
      };
      video.src = URL.createObjectURL(file);
    });
  };

  const handleAddVideo = async () => {
    if (!videoFile) {
      alert('動画ファイルを選択してください');
      return;
    }

    if (!addForm.title.trim()) {
      alert('動画タイトルを入力してください');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      console.log('Client session:', session ? 'Found' : 'Not found');
      console.log('User ID:', session?.user?.id);
      console.log('User email:', session?.user?.email);

      if (!session) {
        throw new Error('認証が必要です。再度ログインしてください。');
      }

      // プロフィールを確認
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      console.log('User profile:', profile);

      // 動画の長さを取得
      let videoDuration = 0;
      try {
        videoDuration = await getVideoDuration(videoFile);
      } catch (durationError) {
        console.warn('動画の長さを取得できませんでした:', durationError);
        // 継続してアップロードを行う（長さは0のまま）
      }

      // すべての動画をAPIエンドポイント経由でアップロード
      const formData = new FormData();
      formData.append('video', videoFile);
      if (thumbnailFile) {
        formData.append('thumbnail', thumbnailFile);
      }
      formData.append('title', addForm.title.trim());
      formData.append('description', addForm.description.trim());
      formData.append('duration', videoDuration.toString());
      formData.append('order_index', addForm.order_index.toString());

      // ファイルサイズを表示
      const fileSizeMB = (videoFile.size / 1024 / 1024).toFixed(1);
      console.log(`Uploading ${fileSizeMB}MB video file...`);

      // XMLHttpRequestを使用してプログレスを追跡
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setUploadProgress(Math.round(percentComplete));
        }
      });

      const uploadPromise = new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) {
            try {
              const result = JSON.parse(xhr.responseText);
              resolve(result);
            } catch (e) {
              reject(new Error('サーバーからの応答が不正です'));
            }
          } else {
            try {
              const response = JSON.parse(xhr.responseText);
              reject(new Error(response.error || 'アップロードに失敗しました'));
            } catch (e) {
              reject(new Error(`アップロードに失敗しました (ステータス: ${xhr.status})`));
            }
          }
        };

        xhr.onerror = () => {
          reject(new Error('ネットワークエラーが発生しました'));
        };

        xhr.ontimeout = () => {
          reject(new Error('アップロードがタイムアウトしました'));
        };

        xhr.open('POST', `/api/courses/${courseId}/videos`);
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
        xhr.timeout = 600000; // 10分のタイムアウト（大きなファイル対応）
        xhr.send(formData);
      });

      const result = await uploadPromise as any;
      console.log('Upload result:', result);

      // リソースを追加
      if (resourcesToAdd.length > 0 && result.data) {
        const videoId = result.data.id;

        for (const resource of resourcesToAdd) {
          try {
            let fileUrl = null;
            let fileName = null;
            let fileSize = null;
            let fileType = null;

            // ファイルがある場合はアップロード
            if (resource.file) {
              const filePath = `resources/${videoId}/${Date.now()}_${resource.file.name}`;
              const { error: uploadError } = await supabase.storage
                .from('videos')
                .upload(filePath, resource.file);

              if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage
                  .from('videos')
                  .getPublicUrl(filePath);
                fileUrl = publicUrl;
                fileName = resource.file.name;
                fileSize = resource.file.size;
                fileType = resource.file.type;
              }
            }

            // リソースをデータベースに保存
            const resourceData = {
              video_id: videoId,
              resource_type: resource.type,
              title: resource.title,
              description: resource.description,
              content: resource.content,
              file_url: fileUrl,
              file_name: fileName,
              file_size: fileSize,
              file_type: fileType,
              is_required: resource.is_required || false,
              display_order: resourcesToAdd.indexOf(resource)
            };

            await fetch(`/api/videos/${videoId}/resources`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(resourceData)
            });
          } catch (error) {
            console.error('リソース追加エラー:', error);
          }
        }
      }

      // フォームをリセット
      setAddForm({
        title: '',
        description: '',
        order_index: 1,
        status: 'active'
      });
      setVideoFile(null);
      setThumbnailFile(null);
      setResourcesToAdd([]);
      setActiveAddTab('basic');
      setShowAddModal(false);
      await fetchVideos();
      alert('動画とリソースが正常にアップロードされました');
    } catch (error) {
      console.error('動画追加エラー:', error);
      alert(`動画の追加に失敗しました: ${(error as Error).message}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleReplaceVideo = async (videoId: string) => {
    if (!replaceFile) {
      alert('置き換える動画ファイルを選択してください');
      return;
    }

    const video = videos.find(v => v.id === videoId);
    if (!video) return;

    setUploading(true);
    setUploadProgress(0);
    
    try {
      // Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('認証が必要です。再度ログインしてください。');
      }

      // APIエンドポイント経由で動画を置き換え
      const formData = new FormData();
      formData.append('video', replaceFile);
      formData.append('title', video.title);
      formData.append('description', video.description || '');
      formData.append('duration', video.duration?.toString() || '0');
      formData.append('order_index', video.order_index.toString());
      formData.append('video_id', videoId); // 置き換え対象のID

      // XMLHttpRequestを使用してプログレスを追跡
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setUploadProgress(Math.round(percentComplete));
        }
      });

      const uploadPromise = new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) {
            try {
              const result = JSON.parse(xhr.responseText);
              resolve(result);
            } catch (e) {
              reject(new Error('サーバーからの応答が不正です'));
            }
          } else {
            try {
              const response = JSON.parse(xhr.responseText);
              reject(new Error(response.error || '置き換えに失敗しました'));
            } catch (e) {
              reject(new Error(`置き換えに失敗しました (ステータス: ${xhr.status})`));
            }
          }
        };

        xhr.onerror = () => {
          reject(new Error('ネットワークエラーが発生しました'));
        };

        xhr.ontimeout = () => {
          reject(new Error('アップロードがタイムアウトしました'));
        };

        // PUT メソッドで置き換えリクエストを送信
        xhr.open('PUT', `/api/courses/${courseId}/videos/${videoId}`);
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
        xhr.timeout = 600000; // 10分のタイムアウト（大きなファイル対応）
        xhr.send(formData);
      });

      await uploadPromise;

      setReplacingVideo(null);
      setReplaceFile(null);
      await fetchVideos();
      alert('動画が正常に置き換えられました');
    } catch (error) {
      console.error('動画置き換えエラー:', error);
      alert(`動画の置き換えに失敗しました: ${(error as Error).message}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // ドラッグ&ドロップハンドラー
  const handleDragStart = (e: React.DragEvent, video: Video) => {
    setDraggedVideo(video);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);

    if (!draggedVideo) return;

    const draggedIndex = videos.findIndex(v => v.id === draggedVideo.id);
    if (draggedIndex === dropIndex) return;

    // 新しい順序を計算
    const newVideos = [...videos];
    newVideos.splice(draggedIndex, 1);
    newVideos.splice(dropIndex, 0, draggedVideo);

    // order_indexを更新
    const updates = newVideos.map((video, index) => ({
      id: video.id,
      order_index: index + 1
    }));

    setVideos(newVideos.map((v, i) => ({ ...v, order_index: i + 1 })));

    try {
      // バッチ更新
      for (const update of updates) {
        await supabase
          .from('videos')
          .update({ order_index: update.order_index })
          .eq('id', update.id);
      }
    } catch (error) {
      console.error('順序更新エラー:', error);
      alert('動画の順序更新に失敗しました');
      await fetchVideos(); // エラー時は元に戻す
    }

    setDraggedVideo(null);
  };

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return '未設定';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
      return `${hours}時間${minutes}分${remainingSeconds}秒`;
    } else if (minutes > 0) {
      return `${minutes}分${remainingSeconds}秒`;
    } else {
      return `${remainingSeconds}秒`;
    }
  };

  const filteredVideos = videos.filter(video =>
    video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    video.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <Link 
                  href={`/admin/courses/${courseId}/edit`}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                </Link>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">動画管理</h1>
                  <p className="text-gray-600 dark:text-gray-400">
                    {course ? `${course.title} の動画一覧` : 'コースの動画を管理します'}
                  </p>
                </div>
              </div>
              <Button onClick={() => setShowAddModal(true)}>
                <PlusIcon className="h-4 w-4 mr-2" />
                動画を追加
              </Button>
            </div>
          </div>

          {/* Search and Stats */}
          <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6 mb-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
              <div className="flex-1 max-w-md">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="動画を検索..."
                    className="w-full pl-4 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center space-x-6 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center">
                  <VideoCameraIcon className="h-4 w-4 mr-1" />
                  <span>動画数: {videos.length}</span>
                </div>
                <div className="flex items-center">
                  <ClockIcon className="h-4 w-4 mr-1" />
                  <span>
                    総時間: {formatDuration(videos.reduce((sum, v) => sum + (v.duration || 0), 0))}
                  </span>
                </div>
                <div className="flex items-center">
                  <ArrowsUpDownIcon className="h-4 w-4 mr-1" />
                  <span className="text-xs">ドラッグで順序変更</span>
                </div>
              </div>
            </div>
          </div>

          {/* Videos List */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800">
            {filteredVideos.length === 0 ? (
              <div className="text-center py-12">
                <VideoCameraIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  {searchTerm ? '検索結果がありません' : '動画がまだありません'}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  {searchTerm 
                    ? '別のキーワードで検索してみてください'
                    : 'このコースに最初の動画を追加しましょう'
                  }
                </p>
                {!searchTerm && (
                  <Button onClick={() => setShowAddModal(true)}>
                    <PlusIcon className="h-4 w-4 mr-2" />
                    動画を追加
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 dark:bg-black">
                    <tr>
                      <th className="w-12 px-6 py-3"></th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        順番
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        動画情報
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        時間
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        ステータス
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        アクション
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200">
                    {filteredVideos.map((video, index) => (
                      <tr 
                        key={video.id} 
                        className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${dragOverIndex === index ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, video)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, index)}
                      >
                        <td className="px-6 py-4 cursor-move">
                          <ArrowsUpDownIcon className="h-4 w-4 text-gray-400" />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          #{video.order_index}
                        </td>
                        <td className="px-6 py-4">
                          {editingVideo === video.id ? (
                            <div className="space-y-2">
                              <Input
                                value={editForm.title}
                                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                placeholder="動画タイトル"
                              />
                              <textarea
                                rows={2}
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900"
                                value={editForm.description}
                                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                placeholder="動画の説明"
                              />
                              <div className="flex space-x-2">
                                <input
                                  type="number"
                                  className="w-20 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                                  value={editForm.order_index}
                                  onChange={(e) => setEditForm({ ...editForm, order_index: parseInt(e.target.value) || 1 })}
                                  min="1"
                                />
                                <select
                                  className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                                  value={editForm.status}
                                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                                >
                                  <option value="active">公開</option>
                                  <option value="inactive">非公開</option>
                                </select>
                                <Button size="sm" onClick={handleSaveEdit}>
                                  保存
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingVideo(null)}>
                                  キャンセル
                                </Button>
                              </div>
                            </div>
                          ) : replacingVideo === video.id ? (
                            <div className="space-y-2">
                              <div className="text-sm font-medium text-gray-900 dark:text-white">{video.title}</div>
                              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3">
                                <input
                                  type="file"
                                  accept="video/*"
                                  onChange={(e) => handleVideoFileChange(e, true)}
                                  className="hidden"
                                  id={`replace-video-${video.id}`}
                                />
                                <label htmlFor={`replace-video-${video.id}`} className="cursor-pointer">
                                  {replaceFile ? (
                                    <div className="text-xs">
                                      <p className="font-medium">{replaceFile.name}</p>
                                      <p className="text-gray-500 dark:text-gray-400">{formatFileSize(replaceFile.size)}</p>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">クリックして置き換える動画を選択</p>
                                  )}
                                </label>
                              </div>
                              <div className="flex space-x-2">
                                <Button 
                                  size="sm" 
                                  onClick={() => handleReplaceVideo(video.id)}
                                  disabled={!replaceFile || uploading}
                                  loading={uploading}
                                >
                                  置き換え
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  onClick={() => {
                                    setReplacingVideo(null);
                                    setReplaceFile(null);
                                  }}
                                >
                                  キャンセル
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-white">{video.title}</div>
                              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{video.description}</div>
                              <div className="text-xs text-gray-400 mt-1">
                                作成日: {new Date(video.created_at).toLocaleDateString('ja-JP')}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          <div className="flex items-center">
                            <ClockIcon className="h-4 w-4 mr-1" />
                            {formatDuration(video.duration)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            video.status === 'active' 
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 dark:bg-neutral-900 text-gray-800 dark:text-gray-200'
                          }`}>
                            {video.status === 'active' ? '公開' : '非公開'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center space-x-2">
                            <Link href={`/videos/${video.id}`}>
                              <button className="text-blue-600 hover:text-blue-900" title="プレビュー">
                                <EyeIcon className="h-4 w-4" />
                              </button>
                            </Link>
                            <Link href={`/admin/courses/${courseId}/videos/${video.id}/edit`}>
                              <button className="text-green-600 hover:text-green-900" title="リソース管理">
                                <DocumentTextIcon className="h-4 w-4" />
                              </button>
                            </Link>
                            <button
                              onClick={() => handleEditVideo(video)}
                              className="text-indigo-600 hover:text-indigo-900"
                              title="編集"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setReplacingVideo(video.id)}
                              className="text-yellow-600 hover:text-yellow-900"
                              title="動画を置き換え"
                            >
                              <DocumentDuplicateIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteVideo(video.id)}
                              className="text-red-600 hover:text-red-900"
                              title="削除"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Add Video Modal */}
          {showAddModal && (
            <div className="fixed inset-0 bg-gray-50 dark:bg-black0 bg-opacity-75 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-neutral-900 rounded-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
                <div className="p-6 border-b border-gray-200 dark:border-neutral-800">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">動画を追加</h2>
                    <button
                      onClick={() => {
                        setShowAddModal(false);
                        setAddForm({ title: '', description: '', order_index: 1, status: 'active' });
                        setVideoFile(null);
                        setThumbnailFile(null);
                        setResourcesToAdd([]);
                        setActiveAddTab('basic');
                      }}
                      className="text-gray-400 hover:text-gray-600 dark:text-gray-400"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200 dark:border-gray-700 px-6">
                  <nav className="-mb-px flex space-x-8">
                    <button
                      onClick={() => setActiveAddTab('basic')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeAddTab === 'basic'
                          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      基本情報
                    </button>
                    <button
                      onClick={() => setActiveAddTab('resources')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeAddTab === 'resources'
                          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      リソース ({resourcesToAdd.length})
                    </button>
                  </nav>
                </div>

                <div className="p-6 overflow-y-auto max-h-[60vh]">
                  {activeAddTab === 'basic' ? (
                    <div className="space-y-4">
                      {/* Video File Upload */}
                      <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        動画ファイル <span className="text-red-500">*</span>
                      </label>
                      <div 
                        className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-gray-400 transition-colors"
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-blue-500'); }}
                        onDragLeave={(e) => { e.currentTarget.classList.remove('border-blue-500'); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.currentTarget.classList.remove('border-blue-500');
                          const file = e.dataTransfer.files[0];
                          if (file && file.type.startsWith('video/')) {
                            const validation = validateVideoFile(file);
                            if (validation.valid) {
                              setVideoFile(file);
                              if (!addForm.title) {
                                const fileName = file.name.split('.').slice(0, -1).join('.');
                                setAddForm(prev => ({ ...prev, title: fileName }));
                              }
                            } else {
                              alert(validation.error);
                            }
                          }
                        }}
                      >
                        <input
                          type="file"
                          accept="video/*"
                          onChange={(e) => handleVideoFileChange(e)}
                          className="hidden"
                          id="video-upload"
                        />
                        <label htmlFor="video-upload" className="cursor-pointer">
                          <ArrowUpTrayIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                          {videoFile ? (
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{videoFile.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {formatFileSize(videoFile.size)} · {videoFile.type}
                              </p>
                            </div>
                          ) : (
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">クリックまたはドラッグ&ドロップで動画を選択</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                MP4, WebM, MOV, AVI など (最大3GB)
                              </p>
                            </div>
                          )}
                        </label>
                      </div>
                    </div>

                    {/* Thumbnail Upload */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        サムネイル画像
                      </label>
                      <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleThumbnailFileChange}
                          className="hidden"
                          id="thumbnail-upload"
                        />
                        <label htmlFor="thumbnail-upload" className="cursor-pointer">
                          {thumbnailFile ? (
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{thumbnailFile.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {formatFileSize(thumbnailFile.size)}
                              </p>
                            </div>
                          ) : (
                            <div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">サムネイル画像を選択</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                JPEG, PNG, WebP (最大10MB)
                              </p>
                            </div>
                          )}
                        </label>
                      </div>
                    </div>

                    {/* Video Title */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        動画タイトル <span className="text-red-500">*</span>
                      </label>
                      <Input
                        value={addForm.title}
                        onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                        placeholder="動画のタイトルを入力..."
                        required
                      />
                    </div>

                    {/* Video Description */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        動画の説明
                      </label>
                      <textarea
                        rows={3}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                        value={addForm.description}
                        onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                        placeholder="動画の説明を入力..."
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Order Index */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          表示順序
                        </label>
                        <input
                          type="number"
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                          value={addForm.order_index}
                          onChange={(e) => setAddForm({ ...addForm, order_index: parseInt(e.target.value) || 1 })}
                          min="1"
                        />
                      </div>

                      {/* Status */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          ステータス
                        </label>
                        <select
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                          value={addForm.status}
                          onChange={(e) => setAddForm({ ...addForm, status: e.target.value as any })}
                        >
                          <option value="active">公開</option>
                          <option value="inactive">非公開</option>
                        </select>
                      </div>
                    </div>

                    {/* Upload Progress */}
                    {uploading && uploadProgress > 0 && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                          <span>アップロード中...</span>
                          <span>{uploadProgress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-50 dark:bg-blue-900/200 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                    </div>
                  ) : (
                    // Resources Tab
                    <div className="space-y-4">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-medium">リソースを追加</h3>
                        <Button
                          size="sm"
                          onClick={() => {
                            const newResource: ResourceToAdd = {
                              type: 'material',
                              title: '',
                              description: '',
                              content: ''
                            };
                            setResourcesToAdd([...resourcesToAdd, newResource]);
                          }}
                        >
                          <PlusIcon className="h-4 w-4 mr-2" />
                          リソースを追加
                        </Button>
                      </div>

                      {resourcesToAdd.length === 0 ? (
                        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                          リソースがまだ追加されていません。上のボタンからリソースを追加してください。
                        </p>
                      ) : (
                        <div className="space-y-4">
                          {resourcesToAdd.map((resource, index) => (
                            <div key={index} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                              <div className="flex justify-between items-start mb-3">
                                <h4 className="font-medium">リソース #{index + 1}</h4>
                                <button
                                  onClick={() => {
                                    const newResources = [...resourcesToAdd];
                                    newResources.splice(index, 1);
                                    setResourcesToAdd(newResources);
                                  }}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              </div>

                              <div className="space-y-3">
                                {/* Resource Type */}
                                <div>
                                  <label className="block text-sm font-medium mb-1">種類</label>
                                  <select
                                    value={resource.type}
                                    onChange={(e) => {
                                      const newResources = [...resourcesToAdd];
                                      newResources[index].type = e.target.value as any;
                                      setResourcesToAdd(newResources);
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                                  >
                                    <option value="material">配布資料</option>
                                    <option value="assignment">課題</option>
                                    <option value="reference">参考資料</option>
                                    <option value="explanation">解説</option>
                                  </select>
                                </div>

                                {/* Title */}
                                <div>
                                  <label className="block text-sm font-medium mb-1">タイトル</label>
                                  <input
                                    type="text"
                                    value={resource.title}
                                    onChange={(e) => {
                                      const newResources = [...resourcesToAdd];
                                      newResources[index].title = e.target.value;
                                      setResourcesToAdd(newResources);
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                                    placeholder="リソースのタイトル"
                                  />
                                </div>

                                {/* Description */}
                                <div>
                                  <label className="block text-sm font-medium mb-1">説明</label>
                                  <textarea
                                    value={resource.description || ''}
                                    onChange={(e) => {
                                      const newResources = [...resourcesToAdd];
                                      newResources[index].description = e.target.value;
                                      setResourcesToAdd(newResources);
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                                    rows={2}
                                    placeholder="リソースの説明（オプション）"
                                  />
                                </div>

                                {/* Content for explanations and assignments */}
                                {(resource.type === 'explanation' || resource.type === 'assignment') && (
                                  <div>
                                    <label className="block text-sm font-medium mb-1">
                                      {resource.type === 'explanation' ? '解説内容' : '課題内容'}
                                    </label>
                                    <textarea
                                      value={resource.content || ''}
                                      onChange={(e) => {
                                        const newResources = [...resourcesToAdd];
                                        newResources[index].content = e.target.value;
                                        setResourcesToAdd(newResources);
                                      }}
                                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                                      rows={4}
                                      placeholder={resource.type === 'explanation' ? '動画の補足説明を入力' : '課題の詳細を入力'}
                                    />
                                  </div>
                                )}

                                {/* File upload for materials and references */}
                                {(resource.type === 'material' || resource.type === 'reference') && (
                                  <div>
                                    <label className="block text-sm font-medium mb-1">ファイル</label>
                                    <input
                                      type="file"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          const newResources = [...resourcesToAdd];
                                          newResources[index].file = file;
                                          setResourcesToAdd(newResources);
                                        }
                                      }}
                                      className="w-full"
                                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.jpg,.jpeg,.png,.gif"
                                    />
                                    {resource.file && (
                                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                        選択: {resource.file.name}
                                      </p>
                                    )}
                                  </div>
                                )}

                                {/* Required flag for assignments */}
                                {resource.type === 'assignment' && (
                                  <div className="flex items-center">
                                    <input
                                      type="checkbox"
                                      id={`required-${index}`}
                                      checked={resource.is_required || false}
                                      onChange={(e) => {
                                        const newResources = [...resourcesToAdd];
                                        newResources[index].is_required = e.target.checked;
                                        setResourcesToAdd(newResources);
                                      }}
                                      className="mr-2"
                                    />
                                    <label htmlFor={`required-${index}`} className="text-sm">
                                      必須課題にする
                                    </label>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="p-6 border-t border-gray-200 dark:border-neutral-800 flex justify-end space-x-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAddModal(false);
                      setAddForm({ title: '', description: '', order_index: 1, status: 'active' });
                      setVideoFile(null);
                      setThumbnailFile(null);
                      setResourcesToAdd([]);
                      setActiveAddTab('basic');
                    }}
                    disabled={uploading}
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleAddVideo}
                    disabled={!videoFile || !addForm.title.trim() || uploading}
                    loading={uploading}
                  >
                    {uploading ? 'アップロード中...' : '動画を追加'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}