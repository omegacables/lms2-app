'use client';

import { useState, useEffect } from 'react';
import { Trash2, Plus, GripVertical } from 'lucide-react';
import { supabase } from '@/lib/database/supabase';

interface Chapter {
  id: number;
  course_id: number;
  title: string;
  description?: string;
  display_order: number;
  created_at: string;
  updated_at: string;
  chapter_videos?: any[];
}

interface Video {
  id: number;
  title: string;
  duration: number;
  thumbnail_url?: string;
}

interface SimpleChapterManagerProps {
  courseId: string;
  courseTitle: string;
}

export default function SimpleChapterManager({ courseId, courseTitle }: SimpleChapterManagerProps) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [courseVideos, setCourseVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [draggedChapter, setDraggedChapter] = useState<Chapter | null>(null);
  const [draggedVideo, setDraggedVideo] = useState<Video | null>(null);

  useEffect(() => {
    fetchChapters();
    fetchCourseVideos();
  }, [courseId]);

  const fetchChapters = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();

      console.log('[SimpleChapterManager] Fetching chapters with session:', {
        hasSession: !!session,
        hasAccessToken: !!session?.access_token,
        courseId: courseId
      });

      const response = await fetch(`/api/chapters?course_id=${courseId}`, {
        headers: {
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
      });

      console.log('[SimpleChapterManager] Response status:', response.status);

      const data = await response.json();

      if (response.ok && data.chapters) {
        setChapters(data.chapters);
        console.log('[SimpleChapterManager] Chapters loaded:', data.chapters.length);
      } else {
        console.error('[SimpleChapterManager] Error response:', data);
        if (response.status === 401) {
          alert('認証エラー: 再度ログインしてください');
        }
      }
    } catch (error) {
      console.error('[SimpleChapterManager] Error fetching chapters:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCourseVideos = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/courses/${courseId}/videos`, {
        headers: {
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
      });
      const data = await response.json();

      if (response.ok) {
        setCourseVideos(Array.isArray(data) ? data : data.videos || []);
      }
    } catch (error) {
      console.error('Error fetching videos:', error);
    }
  };

  const createChapter = async () => {
    if (!newChapterTitle.trim()) return;

    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();

      console.log('[SimpleChapterManager] Creating chapter with session:', {
        hasSession: !!session,
        hasAccessToken: !!session?.access_token,
        courseId: courseId,
        title: newChapterTitle
      });

      const response = await fetch('/api/chapters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
        body: JSON.stringify({
          course_id: courseId,
          title: newChapterTitle
        })
      });

      console.log('[SimpleChapterManager] Create response status:', response.status);

      const data = await response.json();

      if (response.ok) {
        setNewChapterTitle('');
        await fetchChapters();
        alert('章を追加しました');
      } else {
        console.error('[SimpleChapterManager] Create error:', data);
        alert(`エラー: ${data.error}`);
      }
    } catch (error) {
      console.error('[SimpleChapterManager] Error creating chapter:', error);
      alert('章の追加に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const updateChapter = async (chapterId: number, title: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/chapters/${chapterId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
        body: JSON.stringify({ title })
      });

      if (response.ok) {
        await fetchChapters();
      }
    } catch (error) {
      console.error('Error updating chapter:', error);
    }
  };

  const deleteChapter = async (chapterId: number) => {
    if (!confirm('この章を削除しますか？')) return;

    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/chapters/${chapterId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
      });

      if (response.ok) {
        await fetchChapters();
        alert('章を削除しました');
      } else {
        alert('削除に失敗しました');
      }
    } catch (error) {
      console.error('Error deleting chapter:', error);
      alert('削除中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const addVideoToChapter = async (chapterId: number, videoId: number) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      console.log('[SimpleChapterManager] Adding video to chapter:', {
        chapterId,
        videoId,
        hasSession: !!session,
        hasAccessToken: !!session?.access_token
      });

      const response = await fetch(`/api/chapters/${chapterId}/videos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
        body: JSON.stringify({ video_id: videoId })
      });

      const data = await response.json();

      console.log('[SimpleChapterManager] Add video response:', {
        status: response.status,
        data
      });

      if (response.ok) {
        await fetchChapters();
        alert('動画を章に追加しました');
      } else {
        console.error('[SimpleChapterManager] Error response:', data);
        alert(`エラー: ${data.error}${data.details ? '\n詳細: ' + data.details : ''}`);
      }
    } catch (error) {
      console.error('[SimpleChapterManager] Error adding video:', error);
      alert('動画の追加に失敗しました');
    }
  };

  const removeVideoFromChapter = async (chapterId: number, videoId: number) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/chapters/${chapterId}/videos?video_id=${videoId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
      });

      if (response.ok) {
        await fetchChapters();
      }
    } catch (error) {
      console.error('Error removing video:', error);
    }
  };

  const getUnassignedVideos = () => {
    const assignedVideoIds = new Set(
      chapters.flatMap(ch =>
        ch.chapter_videos?.map(cv => cv.video_id) || []
      )
    );
    return courseVideos.filter(v => !assignedVideoIds.has(v.id));
  };

  const handleDragStart = (chapter: Chapter) => {
    setDraggedChapter(chapter);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (targetChapter: Chapter) => {
    if (!draggedChapter || draggedChapter.id === targetChapter.id) {
      setDraggedChapter(null);
      return;
    }

    const oldIndex = chapters.findIndex(c => c.id === draggedChapter.id);
    const newIndex = chapters.findIndex(c => c.id === targetChapter.id);

    const reorderedChapters = [...chapters];
    reorderedChapters.splice(oldIndex, 1);
    reorderedChapters.splice(newIndex, 0, draggedChapter);

    // 表示順序を更新
    const updatedChapters = reorderedChapters.map((ch, index) => ({
      ...ch,
      display_order: index
    }));

    setChapters(updatedChapters);
    setDraggedChapter(null);

    // サーバーに順序を保存
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/chapters', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
        body: JSON.stringify({
          chapters: updatedChapters.map(ch => ({ id: ch.id, display_order: ch.display_order }))
        })
      });
    } catch (error) {
      console.error('Error updating chapter order:', error);
      // エラー時は元に戻す
      fetchChapters();
    }
  };

  const handleVideoDragStart = (video: Video) => {
    setDraggedVideo(video);
  };

  const handleVideoDrop = async (targetChapter: Chapter) => {
    if (!draggedVideo) {
      setDraggedVideo(null);
      return;
    }

    console.log('[SimpleChapterManager] Dropping video:', {
      videoId: draggedVideo.id,
      chapterId: targetChapter.id
    });

    await addVideoToChapter(targetChapter.id, draggedVideo.id);
    setDraggedVideo(null);
  };

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">章管理 - {courseTitle}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          コースID: {courseId} | 章数: {chapters.length} | 動画数: {courseVideos.length}
        </p>
      </div>

      {/* 新規章追加 */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
        <div className="flex gap-2">
          <input
            type="text"
            value={newChapterTitle}
            onChange={(e) => setNewChapterTitle(e.target.value)}
            placeholder="新しい章のタイトル"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            disabled={loading}
          />
          <button
            onClick={createChapter}
            disabled={loading || !newChapterTitle.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-5 h-5 inline mr-1" />
            章を追加
          </button>
        </div>
      </div>

      {/* 章一覧 */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
          </div>
        ) : chapters.length === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-800 p-8 rounded-lg text-center">
            <p className="text-gray-500 dark:text-gray-400">章がまだありません</p>
          </div>
        ) : (
          chapters.map((chapter) => (
            <div
              key={chapter.id}
              className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow cursor-move transition-opacity"
              draggable
              onDragStart={() => handleDragStart(chapter)}
              onDragOver={handleDragOver}
              onDrop={(e) => {
                if (draggedVideo) {
                  handleVideoDrop(chapter);
                } else {
                  handleDrop(chapter);
                }
              }}
              style={{
                opacity: draggedChapter?.id === chapter.id ? 0.5 : 1,
                border: draggedVideo ? '2px dashed #3b82f6' : 'none'
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-5 h-5 text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing" />
                  <input
                    type="text"
                    value={chapter.title}
                    onChange={(e) => updateChapter(chapter.id, e.target.value)}
                    className="font-medium text-lg border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 outline-none px-1 bg-transparent text-gray-900 dark:text-white"
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    (ID: {chapter.id}, 順序: {chapter.display_order})
                  </span>
                </div>
                <button
                  onClick={() => deleteChapter(chapter.id)}
                  className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              {/* 章内の動画 */}
              <div className="ml-7 mt-2">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  動画: {chapter.chapter_videos?.length || 0}件
                </div>
                <div className="space-y-1">
                  {chapter.chapter_videos?.map((cv: any) => (
                    <div key={cv.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 p-2 rounded">
                      <span className="text-sm text-gray-900 dark:text-gray-100">
                        {cv.videos?.title || `動画ID: ${cv.video_id}`}
                      </span>
                      <button
                        onClick={() => removeVideoFromChapter(chapter.id, cv.video_id)}
                        className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>

                {/* 動画を追加 */}
                {selectedChapter?.id === chapter.id ? (
                  <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/30 rounded">
                    <div className="text-sm font-medium mb-1 text-gray-900 dark:text-white">動画を追加:</div>
                    <div className="space-y-1">
                      {getUnassignedVideos().map(video => (
                        <button
                          key={video.id}
                          onClick={() => {
                            addVideoToChapter(chapter.id, video.id);
                            setSelectedChapter(null);
                          }}
                          className="block w-full text-left text-sm p-1 hover:bg-blue-100 dark:hover:bg-blue-800 rounded text-gray-900 dark:text-gray-100"
                        >
                          {video.title}
                        </button>
                      ))}
                      {getUnassignedVideos().length === 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">割り当て可能な動画がありません</p>
                      )}
                    </div>
                    <button
                      onClick={() => setSelectedChapter(null)}
                      className="mt-2 text-xs text-gray-600 dark:text-gray-400"
                    >
                      キャンセル
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedChapter(chapter)}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    + 動画を追加
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 未割り当て動画 */}
      <div className="bg-yellow-50 dark:bg-yellow-900/30 p-4 rounded-lg">
        <h3 className="font-medium mb-2 text-gray-900 dark:text-white">未割り当ての動画（章にドラッグ&ドロップ可能）</h3>
        <div className="space-y-1">
          {getUnassignedVideos().map(video => (
            <div
              key={video.id}
              draggable
              onDragStart={() => handleVideoDragStart(video)}
              onDragEnd={() => setDraggedVideo(null)}
              className="text-sm p-2 bg-white dark:bg-gray-700 rounded text-gray-900 dark:text-gray-100 cursor-move hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              style={{ opacity: draggedVideo?.id === video.id ? 0.5 : 1 }}
            >
              📹 {video.title}
            </div>
          ))}
          {getUnassignedVideos().length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">すべての動画が章に割り当てられています</p>
          )}
        </div>
      </div>
    </div>
  );
}