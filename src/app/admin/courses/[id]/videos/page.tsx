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
  DocumentTextIcon,
  DocumentIcon,
  AcademicCapIcon,
  BookOpenIcon
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

  // 権限チェックは削除（AuthGuardで処理されるため）

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
        .select('*')
        .eq('id', courseId)
        .single();

      if (!courseError && courseData) {
        setCourse(courseData);
      }
    } catch (error) {
      console.error('Videos Page: Error fetching course:', error);
    }
  };

  const fetchVideos = async () => {
    try {
      setLoading(true);
      const { data: videosData, error: videosError } = await supabase
        .from('videos')
        .select('*')
        .eq('course_id', courseId)
        .order('order_index');

      if (!videosError && videosData) {
        setVideos(videosData);
      }
    } catch (error) {
      console.error('Videos Page: Error fetching videos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    if (!confirm('この動画を削除してもよろしいですか？')) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`/api/courses/${courseId}/videos/${videoId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        }
      });

      if (response.ok) {
        alert('動画を削除しました');
        await fetchVideos();
      } else {
        const error = await response.json();
        alert(`削除に失敗しました: ${error.error}`);
      }
    } catch (error) {
      console.error('Error deleting video:', error);
      alert('削除中にエラーが発生しました');
    }
  };

  const handleDuplicateVideo = async (videoId: string) => {
    if (!confirm('この動画を複製しますか？')) {
      return;
    }

    try {
      // 複製元の動画データを取得
      const videoToDuplicate = videos.find(v => v.id === videoId);
      if (!videoToDuplicate) {
        alert('動画が見つかりません');
        return;
      }

      // 最大のorder_indexを取得
      const maxOrderIndex = Math.max(...videos.map(v => v.order_index), 0);

      // 新しい動画レコードを作成
      const { data, error } = await supabase
        .from('videos')
        .insert({
          course_id: courseId,
          title: `${videoToDuplicate.title}（コピー）`,
          description: videoToDuplicate.description,
          file_url: videoToDuplicate.file_url,
          file_size: videoToDuplicate.file_size,
          mime_type: videoToDuplicate.mime_type,
          duration: videoToDuplicate.duration,
          order_index: maxOrderIndex + 1,
          status: 'inactive', // 複製は非公開で作成
        })
        .select()
        .single();

      if (error) {
        console.error('Error duplicating video:', error);
        alert(`複製に失敗しました: ${error.message}`);
        return;
      }

      alert('動画を複製しました');
      await fetchVideos();
    } catch (error) {
      console.error('Error duplicating video:', error);
      alert('複製中にエラーが発生しました');
    }
  };

  const handleEditVideo = (video: Video) => {
    setEditingVideo(video.id);
    setEditForm({
      title: video.title,
      description: video.description || '',
      order_index: video.order_index,
      status: video.status
    });
  };

  const handleSaveEdit = async () => {
    if (!editingVideo) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      // デバッグ: ユーザーIDを表示
      console.log('Current user ID:', session?.user?.id);
      console.log('Current user email:', session?.user?.email);

      const response = await fetch(`/api/videos/${editingVideo}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          order_index: editForm.order_index,
          status: editForm.status
        })
      });

      if (response.ok) {
        await fetchVideos();
        setEditingVideo(null);
        alert('動画情報を更新しました');
      } else {
        const error = await response.json();
        console.error('API Error:', error);
        alert(`更新に失敗しました: ${error.error}\n\nユーザーID: ${session?.user?.id}\nメール: ${session?.user?.email}\n\n詳細: ${JSON.stringify(error.debug || {})}`);
      }
    } catch (error) {
      console.error('Error updating video:', error);
      alert('更新中にエラーが発生しました');
    }
  };

  const handleCancelEdit = () => {
    setEditingVideo(null);
    setEditForm({
      title: '',
      description: '',
      order_index: 1,
      status: 'active'
    });
  };

  const handleReplaceVideo = async (videoId: string) => {
    if (!replaceFile) {
      alert('ファイルを選択してください');
      return;
    }

    const validation = validateVideoFile(replaceFile);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // 既存の動画情報を取得
      const video = videos.find(v => v.id === videoId);
      if (!video) {
        alert('動画が見つかりません');
        return;
      }

      setUploadProgress(10);

      // 1. 新しいファイルをSupabase Storageに直接アップロード（大きなファイル対応）
      const fileName = `${Date.now()}-${replaceFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const filePath = `course-${courseId}/${fileName}`;

      setUploadProgress(20);

      // Supabase Storageに直接アップロード
      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(filePath, replaceFile, {
          contentType: replaceFile.type,
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw new Error(`アップロードエラー: ${uploadError.message}`);
      }

      setUploadProgress(60);

      // 2. 動画URLを取得
      const { data: urlData } = supabase.storage
        .from('videos')
        .getPublicUrl(filePath);

      setUploadProgress(70);

      // 3. データベースを更新（video_idは変更せず、ファイル情報のみ更新）
      // これにより、既存の学習ログ（viewing_logs）は自動的に保持されます
      const { error: updateError } = await supabase
        .from('videos')
        .update({
          file_url: urlData.publicUrl,
          file_size: replaceFile.size,
          mime_type: replaceFile.type,
          updated_at: new Date().toISOString()
        })
        .eq('id', videoId);

      if (updateError) {
        console.error('Database update error:', updateError);
        // アップロードしたファイルを削除
        await supabase.storage.from('videos').remove([filePath]);
        throw new Error(`データベース更新に失敗しました: ${updateError.message}`);
      }

      setUploadProgress(90);

      // 4. 古いファイルを削除
      const oldFilePath = video.file_url?.split('/storage/v1/object/public/videos/')[1];
      if (oldFilePath) {
        await supabase.storage.from('videos').remove([oldFilePath]);
      }

      setUploadProgress(100);
      alert('動画を置き換えました');
      await fetchVideos();
      setReplacingVideo(null);
      setReplaceFile(null);
    } catch (error) {
      console.error('Error replacing video:', error);
      alert(`置き換え中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // ドラッグ&ドロップのハンドラー
  const handleDragStart = (e: React.DragEvent<HTMLTableRowElement>, video: Video) => {
    setDraggedVideo(video);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLTableRowElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent<HTMLTableRowElement>, dropIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);

    if (!draggedVideo) return;

    const draggedIndex = videos.findIndex(v => v.id === draggedVideo.id);
    if (draggedIndex === dropIndex) return;

    const newVideos = [...videos];
    newVideos.splice(draggedIndex, 1);
    newVideos.splice(dropIndex, 0, draggedVideo);

    // 新しい順序を計算
    const updatedVideos = newVideos.map((video, index) => ({
      ...video,
      order_index: index + 1
    }));

    setVideos(updatedVideos);

    // APIで順序を更新
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const videoUpdates = updatedVideos.map(video => ({
        id: video.id,
        order_index: video.order_index
      }));

      const response = await fetch(`/api/courses/${courseId}/videos`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
        body: JSON.stringify({ videoUpdates })
      });

      if (!response.ok) {
        console.error('Failed to update video order');
        // 失敗したら元に戻す
        await fetchVideos();
      }
    } catch (error) {
      console.error('Error updating video order:', error);
      await fetchVideos();
    }

    setDraggedVideo(null);
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}時間`);
    if (minutes > 0) parts.push(`${minutes}分`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}秒`);

    return parts.join('');
  };

  const filteredVideos = videos.filter(video =>
    video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    video.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AuthGuard requiredRole="admin">
      <MainLayout>
        <div className="min-h-screen bg-gray-50 dark:bg-neutral-950">
          {/* Navigation */}
          <div className="mb-8 pt-6 px-4 sm:px-6 lg:px-8">
            <Link
              href="/admin/courses"
              className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-2" />
              コース管理に戻る
            </Link>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6 mb-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-4">
                  <VideoCameraIcon className="h-8 w-8 text-blue-600 dark:text-blue-500" />
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                      動画管理
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      {course ? `${course.title} の動画一覧` : 'コースの動画を管理します'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link href={`/admin/courses/${courseId}/chapters`}>
                    <Button variant="outline">
                      <BookOpenIcon className="h-4 w-4 mr-2" />
                      章を管理
                    </Button>
                  </Link>
                  <Button onClick={() => setShowAddModal(true)}>
                    <PlusIcon className="h-4 w-4 mr-2" />
                    動画を追加
                  </Button>
                </div>
              </div>
            </div>

            {/* Search and Stats */}
            <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6 mb-6">
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
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-neutral-800">
                      {filteredVideos.map((video, index) => (
                        <tr
                          key={video.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, video)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, index)}
                          className={`
                            ${dragOverIndex === index ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                            ${draggedVideo?.id === video.id ? 'opacity-50' : ''}
                            hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-move
                          `}
                        >
                          <td className="px-6 py-4">
                            <ArrowsUpDownIcon className="h-5 w-5 text-gray-400" />
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                            {video.order_index}
                          </td>
                          <td className="px-6 py-4">
                            {editingVideo === video.id ? (
                              <div className="space-y-2">
                                <Input
                                  value={editForm.title}
                                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                  placeholder="タイトル"
                                />
                                <textarea
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-neutral-800 text-gray-900 dark:text-white"
                                  value={editForm.description}
                                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                  placeholder="説明"
                                  rows={2}
                                />
                                <select
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-neutral-800 text-gray-900 dark:text-white"
                                  value={editForm.status}
                                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as 'active' | 'inactive' })}
                                >
                                  <option value="active">公開</option>
                                  <option value="inactive">非公開</option>
                                </select>
                                <div className="flex space-x-2">
                                  <Button size="sm" onClick={handleSaveEdit}>保存</Button>
                                  <Button size="sm" variant="outline" onClick={handleCancelEdit}>キャンセル</Button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                  {video.title}
                                </p>
                                {video.description && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {video.description}
                                  </p>
                                )}
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                  サイズ: {formatFileSize(video.file_size)}
                                </p>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                            {formatDuration(video.duration || 0)}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                video.status === 'active'
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {video.status === 'active' ? '公開' : '非公開'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-medium">
                            <div className="flex justify-end space-x-2">
                              <button
                                onClick={() => window.open(video.file_url, '_blank')}
                                className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                                title="視聴"
                              >
                                <EyeIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => handleEditVideo(video)}
                                className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                                title="編集"
                              >
                                <PencilIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => setReplacingVideo(video.id)}
                                className="text-yellow-600 hover:text-yellow-900 dark:text-yellow-400 dark:hover:text-yellow-300"
                                title="置き換え"
                              >
                                <ArrowUpTrayIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => handleDuplicateVideo(video.id)}
                                className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                                title="複製"
                              >
                                <DocumentDuplicateIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => handleDeleteVideo(video.id)}
                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                title="削除"
                              >
                                <TrashIcon className="h-5 w-5" />
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

            {/* Video Resources Section */}
            {filteredVideos.length > 0 && (
              <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6 mt-6">
                <div className="flex items-center mb-4">
                  <DocumentTextIcon className="h-5 w-5 text-gray-600 dark:text-gray-400 mr-2" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    課題・参考資料設定
                  </h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  各動画に課題や参考資料を追加して、学習効果を高めることができます。
                </p>
                <div className="space-y-3">
                  {filteredVideos.map((video) => (
                    <div key={video.id} className="border border-gray-200 dark:border-neutral-800 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-gray-900 dark:text-white flex items-center">
                          <VideoCameraIcon className="h-4 w-4 mr-2 text-gray-500" />
                          {video.title}
                        </h4>
                        <Link
                          href={`/admin/courses/${courseId}/videos/${video.id}/edit`}
                          className="inline-flex items-center px-3 py-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900 transition-colors"
                        >
                          <PencilIcon className="h-3 w-3 mr-1" />
                          リソース編集
                        </Link>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-start">
                          <AcademicCapIcon className="h-4 w-4 text-gray-400 mt-0.5 mr-2 flex-shrink-0" />
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">課題:</span>
                            <span className="ml-2 text-gray-500 dark:text-gray-500">
                              未設定
                            </span>
                          </div>
                        </div>
                        <div className="flex items-start">
                          <DocumentIcon className="h-4 w-4 text-gray-400 mt-0.5 mr-2 flex-shrink-0" />
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">参考資料:</span>
                            <span className="ml-2 text-gray-500 dark:text-gray-500">
                              未設定
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add Video Modal */}
            {showAddModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white dark:bg-neutral-900 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                  <div className="p-6 border-b border-gray-200 dark:border-neutral-800">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      動画をアップロード
                    </h2>
                  </div>
                  <div className="p-6">
                    <VideoUploader
                      courseId={courseId}
                      onSuccess={() => {
                        setShowAddModal(false);
                        fetchVideos();
                      }}
                      onCancel={() => setShowAddModal(false)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Replace Video Modal */}
            {replacingVideo && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white dark:bg-neutral-900 rounded-lg max-w-md w-full">
                  <div className="p-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      動画を置き換え
                    </h2>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(e) => setReplaceFile(e.target.files?.[0] || null)}
                      className="mb-4 text-sm text-gray-900 dark:text-white"
                      disabled={uploading}
                    />
                    {uploading && (
                      <div className="mb-4">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          アップロード中: {uploadProgress}%
                        </p>
                      </div>
                    )}
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setReplacingVideo(null);
                          setReplaceFile(null);
                        }}
                        disabled={uploading}
                      >
                        キャンセル
                      </Button>
                      <Button
                        onClick={() => handleReplaceVideo(replacingVideo)}
                        disabled={!replaceFile || uploading}
                      >
                        置き換え
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}