'use client';

import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Bars3Icon
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface Chapter {
  id: string;
  title: string;
  display_order: number;
  videos?: Video[];
}

interface Video {
  id: string;
  title: string;
  display_order: number;
  chapter_id?: string | null;
}

interface ChapterManagerProps {
  courseId: string;
}

export function ChapterManager({ courseId }: ChapterManagerProps) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [unassignedVideos, setUnassignedVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editingChapterTitle, setEditingChapterTitle] = useState('');
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchChapters();
  }, [courseId]);

  const fetchChapters = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/courses/${courseId}/chapters`);
      const data = await response.json();

      if (response.ok) {
        console.log('ChapterManager: Fetched chapters:', data.chapters);
        console.log('ChapterManager: Unassigned videos:', data.unassignedVideos);
        setChapters(data.chapters || []);
        setUnassignedVideos(data.unassignedVideos || []);
        // 初期状態で全章を展開
        setExpandedChapters(new Set(data.chapters?.map((c: Chapter) => c.id) || []));
      }
    } catch (error) {
      console.error('Error fetching chapters:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddChapter = async () => {
    if (!newChapterTitle.trim()) return;

    try {
      const response = await fetch(`/api/courses/${courseId}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newChapterTitle })
      });

      if (response.ok) {
        const newChapter = await response.json();
        setNewChapterTitle('');
        // 最新のデータを取得して表示を更新
        await fetchChapters();
        setExpandedChapters(prev => new Set([...prev, newChapter.id]));
      }
    } catch (error) {
      console.error('Error adding chapter:', error);
    }
  };

  const handleUpdateChapter = async (chapterId: string) => {
    if (!editingChapterTitle.trim()) return;

    try {
      const response = await fetch(`/api/courses/${courseId}/chapters/${chapterId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editingChapterTitle })
      });

      if (response.ok) {
        setChapters(chapters.map(ch =>
          ch.id === chapterId ? { ...ch, title: editingChapterTitle } : ch
        ));
        setEditingChapterId(null);
        setEditingChapterTitle('');
      }
    } catch (error) {
      console.error('Error updating chapter:', error);
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    if (!confirm('この章を削除してもよろしいですか？章内の動画は未割り当てになります。')) {
      return;
    }

    try {
      const response = await fetch(`/api/courses/${courseId}/chapters/${chapterId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        const deletedChapter = chapters.find(ch => ch.id === chapterId);
        if (deletedChapter?.videos) {
          setUnassignedVideos([...unassignedVideos, ...deletedChapter.videos]);
        }
        setChapters(chapters.filter(ch => ch.id !== chapterId));
      }
    } catch (error) {
      console.error('Error deleting chapter:', error);
    }
  };

  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;

    const { source, destination, type } = result;

    if (type === 'chapter') {
      // 章の並び替え
      const newChapters = Array.from(chapters);
      const [reorderedItem] = newChapters.splice(source.index, 1);
      newChapters.splice(destination.index, 0, reorderedItem);

      setChapters(newChapters);

      // APIに更新を送信
      setSaving(true);
      try {
        await fetch(`/api/courses/${courseId}/chapters`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chapters: newChapters })
        });
      } catch (error) {
        console.error('Error updating chapter order:', error);
      } finally {
        setSaving(false);
      }
    } else if (type === 'video') {
      // 動画の章間移動
      const sourceChapterId = source.droppableId;
      const destChapterId = destination.droppableId;

      if (sourceChapterId === destChapterId) {
        // 同じ章内での並び替えは現在サポートしていません
        return;
      }

      // ソースから動画を取得
      let movedVideo: Video | undefined;

      if (sourceChapterId === 'unassigned') {
        movedVideo = unassignedVideos[source.index];
        setUnassignedVideos(prev => prev.filter((_, idx) => idx !== source.index));
      } else {
        const sourceChapter = chapters.find(ch => ch.id === sourceChapterId);
        if (sourceChapter?.videos) {
          movedVideo = sourceChapter.videos[source.index];
          setChapters(prev => prev.map(ch =>
            ch.id === sourceChapterId
              ? { ...ch, videos: ch.videos?.filter((_, idx) => idx !== source.index) }
              : ch
          ));
        }
      }

      if (!movedVideo) return;

      // デスティネーションに動画を追加
      if (destChapterId === 'unassigned') {
        setUnassignedVideos(prev => [
          ...prev.slice(0, destination.index),
          movedVideo!,
          ...prev.slice(destination.index)
        ]);
        // APIで章の割り当てを解除
        const response = await fetch(`/api/videos/${movedVideo.id}/assign-chapter`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chapterId: null })
        });
        if (!response.ok) {
          console.error('Failed to unassign video from chapter');
          // エラー時はデータを再取得
          await fetchChapters();
        }
      } else {
        setChapters(prev => prev.map(ch =>
          ch.id === destChapterId
            ? {
                ...ch,
                videos: [
                  ...(ch.videos || []).slice(0, destination.index),
                  movedVideo!,
                  ...(ch.videos || []).slice(destination.index)
                ]
              }
            : ch
        ));
        // APIで章に割り当て
        const response = await fetch(`/api/videos/${movedVideo.id}/assign-chapter`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chapterId: destChapterId })
        });
        if (!response.ok) {
          console.error('Failed to assign video to chapter');
          // エラー時はデータを再取得
          await fetchChapters();
        }
      }
    }
  };

  const toggleChapterExpansion = (chapterId: string) => {
    setExpandedChapters(prev => {
      const newSet = new Set(prev);
      if (newSet.has(chapterId)) {
        newSet.delete(chapterId);
      } else {
        newSet.add(chapterId);
      }
      return newSet;
    });
  };

  if (loading) {
    return <div className="text-center py-4">読み込み中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* 新しい章を追加 */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">章の管理</h3>
        <div className="flex space-x-2">
          <Input
            placeholder="新しい章のタイトル"
            value={newChapterTitle}
            onChange={(e) => setNewChapterTitle(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddChapter();
              }
            }}
          />
          <Button onClick={handleAddChapter} disabled={!newChapterTitle.trim()}>
            <PlusIcon className="h-4 w-4 mr-2" />
            章を追加
          </Button>
        </div>
      </div>

      {/* 章と動画のリスト */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="space-y-4">
          {/* 章のリスト */}
          <Droppable droppableId="chapters" type="chapter">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                {chapters.map((chapter, index) => (
                  <Draggable key={chapter.id} draggableId={chapter.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`bg-white dark:bg-neutral-900 rounded-lg border ${
                          snapshot.isDragging
                            ? 'border-blue-500 shadow-lg'
                            : 'border-gray-200 dark:border-neutral-800'
                        }`}
                      >
                        <div className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center flex-1">
                              <div {...provided.dragHandleProps} className="mr-3 cursor-move">
                                <Bars3Icon className="h-5 w-5 text-gray-400" />
                              </div>
                              <button
                                onClick={() => toggleChapterExpansion(chapter.id)}
                                className="mr-2"
                              >
                                {expandedChapters.has(chapter.id) ? (
                                  <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                                ) : (
                                  <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                                )}
                              </button>
                              {editingChapterId === chapter.id ? (
                                <div className="flex items-center space-x-2 flex-1">
                                  <Input
                                    value={editingChapterTitle}
                                    onChange={(e) => setEditingChapterTitle(e.target.value)}
                                    onKeyPress={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleUpdateChapter(chapter.id);
                                      }
                                    }}
                                    onBlur={() => handleUpdateChapter(chapter.id)}
                                    autoFocus
                                    className="flex-1"
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center flex-1">
                                  <h4 className="font-medium text-gray-900 dark:text-white">
                                    第{index + 1}章: {chapter.title}
                                  </h4>
                                  <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                                    ({chapter.videos?.length || 0} 動画)
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => {
                                  setEditingChapterId(chapter.id);
                                  setEditingChapterTitle(chapter.title);
                                }}
                                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                              >
                                <PencilIcon className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteChapter(chapter.id)}
                                className="p-1 text-red-400 hover:text-red-600"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {/* 章内の動画リスト */}
                          {expandedChapters.has(chapter.id) && (
                            <Droppable droppableId={chapter.id} type="video">
                              {(provided) => (
                                <div
                                  {...provided.droppableProps}
                                  ref={provided.innerRef}
                                  className="mt-4 ml-8 space-y-1 min-h-[40px] border-l-2 border-gray-200 dark:border-neutral-700 pl-4"
                                >
                                  {chapter.videos?.map((video, videoIndex) => (
                                    <Draggable
                                      key={video.id}
                                      draggableId={`video-${video.id}`}
                                      index={videoIndex}
                                    >
                                      {(provided, snapshot) => (
                                        <div
                                          ref={provided.innerRef}
                                          {...provided.draggableProps}
                                          {...provided.dragHandleProps}
                                          className={`p-2 rounded ${
                                            snapshot.isDragging
                                              ? 'bg-blue-50 dark:bg-blue-900/20'
                                              : 'bg-gray-50 dark:bg-neutral-800'
                                          }`}
                                        >
                                          <span className="text-sm text-gray-700 dark:text-gray-300">
                                            {video.title}
                                          </span>
                                        </div>
                                      )}
                                    </Draggable>
                                  )) || (
                                    <div className="text-sm text-gray-400 italic">
                                      動画をここにドラッグ
                                    </div>
                                  )}
                                  {provided.placeholder}
                                </div>
                              )}
                            </Droppable>
                          )}
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>

          {/* 未割り当ての動画 */}
          {unassignedVideos.length > 0 && (
            <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-700 p-4">
              <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                未割り当ての動画
              </h4>
              <Droppable droppableId="unassigned" type="video">
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="space-y-1 min-h-[40px]"
                  >
                    {unassignedVideos.map((video, index) => (
                      <Draggable
                        key={video.id}
                        draggableId={`unassigned-video-${video.id}`}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`p-2 rounded ${
                              snapshot.isDragging
                                ? 'bg-blue-50 dark:bg-blue-900/20'
                                : 'bg-white dark:bg-neutral-900'
                            }`}
                          >
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {video.title}
                            </span>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          )}
        </div>
      </DragDropContext>

      {saving && (
        <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
          保存中...
        </div>
      )}
    </div>
  );
}