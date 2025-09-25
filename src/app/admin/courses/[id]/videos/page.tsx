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
import { VideoUploader } from '@/components/admin/VideoUploader';
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

  // 動画置き換え用の状態
  const [replacingVideo, setReplacingVideo] = useState<string | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // ドラッグ&ドロップ用の状態
  const [draggedVideo, setDraggedVideo] = useState<Video | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (courseId) {
      fetchCourse();
      fetchVideos();
    }
  }, [courseId]);


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

      console.log('取得した動画データ:', videosData);
      console.log('動画の時間情報:', videosData?.map(v => ({ id: v.id, title: v.title, duration: v.duration })));

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

      // ユーザープロファイルを確認
      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      console.log('削除実行ユーザー:', {
        userId: session.user.id,
        email: session.user.email,
        role: userProfile?.role,
        profileError
      });

      // 管理者またはインストラクター権限を確認
      if (!userProfile || !['admin', 'instructor'].includes(userProfile.role)) {
        throw new Error(`権限が不足しています。現在のロール: ${userProfile?.role || 'なし'}`);
      }

      // 動画情報を取得 - まずfile_urlで試し、失敗したらurlで試す
      let video: any = null;
      let fetchError: any = null;

      // 新しいスキーマで試す
      const { data: videoNew, error: errorNew } = await supabase
        .from('videos')
        .select('file_url, file_path')
        .eq('id', videoId)
        .single();

      if (!errorNew && videoNew) {
        video = videoNew;
      } else {
        // 古いスキーマで試す
        const { data: videoOld, error: errorOld } = await supabase
          .from('videos')
          .select('*')
          .eq('id', videoId)
          .single();

        if (!errorOld && videoOld) {
          video = videoOld;
        } else {
          fetchError = errorNew || errorOld;
        }
      }

      if (fetchError || !video) {
        console.error('動画取得エラー:', fetchError);
        throw new Error('動画が見つかりません');
      }

      // ストレージから動画ファイルを削除
      // file_pathが存在する場合はそれを使用、そうでなければURLから抽出
      let filePathToDelete = video.file_path;

      if (!filePathToDelete && (video.file_url || video.url)) {
        const fileUrl = video.file_url || video.url;
        const urlParts = fileUrl.split('/storage/v1/object/public/videos/');
        if (urlParts.length > 1) {
          filePathToDelete = decodeURIComponent(urlParts[1]);
        }
      }

      if (filePathToDelete) {
        console.log('ストレージから削除:', filePathToDelete);

        try {
          const { data: deleteData, error: storageError } = await supabase.storage
            .from('videos')
            .remove([filePathToDelete]);

          if (storageError) {
            console.error('ストレージ削除エラー:', storageError);
            // ストレージ削除に失敗してもデータベース削除は続行
          } else {
            console.log('ストレージから削除成功:', deleteData);
          }
        } catch (e) {
          console.error('ストレージ削除例外:', e);
        }
      }

      // データベースから動画レコードを削除（直接Supabaseを使用）
      const { data: deletedVideo, error: deleteError } = await supabase
        .from('videos')
        .delete()
        .eq('id', videoId)
        .eq('course_id', courseId)
        .select()
        .single();

      if (deleteError) {
        console.error('データベース削除エラー:', deleteError);
        throw new Error('データベースからの削除に失敗しました');
      }

      console.log('データベースから削除成功:', deletedVideo);

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
    if (!seconds || seconds === 0) return '時間が未設定';
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
                            {formatDuration(video.duration || 0)}
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
                      }}
                      className="text-gray-400 hover:text-gray-600 dark:text-gray-400"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Video Uploader */}
                <div className="p-6 overflow-y-auto max-h-[60vh]">
                  <VideoUploader
                    courseId={parseInt(courseId)}
                    onSuccess={() => {
                      setShowAddModal(false);
                      fetchVideos();
                    }}
                    onError={(error) => {
                      console.error('動画アップロードエラー:', error);
                      alert(`動画のアップロードに失敗しました: ${error.message}`);
                    }}
                  />
                </div>
                
                <div className="p-6 border-t border-gray-200 dark:border-neutral-800 flex justify-end space-x-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAddModal(false);
                    }}
                  >
                    閉じる
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