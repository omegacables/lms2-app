'use client';

import { useState, useEffect } from 'react';

export default function TestSimpleChapters() {
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toISOString().substring(11, 19);
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 20));
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      addLog('Fetching courses...');
      const response = await fetch('/api/courses');
      const data = await response.json();
      if (data.courses) {
        setCourses(data.courses);
        addLog(`Found ${data.courses.length} courses`);
      }
    } catch (error) {
      addLog(`Error fetching courses: ${error}`);
    }
  };

  const selectCourse = async (course: any) => {
    setSelectedCourse(course);
    addLog(`Selected course: ${course.title} (ID: ${course.id})`);
    await fetchChapters(course.id);
  };

  const fetchChapters = async (courseId: string) => {
    try {
      setLoading(true);
      addLog(`Fetching chapters for course ${courseId}...`);

      const response = await fetch(`/api/courses/${courseId}/chapters`);
      const data = await response.json();

      addLog(`Response status: ${response.status}`);
      addLog(`Response data: ${JSON.stringify(data).substring(0, 100)}...`);

      if (data.chapters) {
        setChapters(data.chapters);
        addLog(`Found ${data.chapters.length} chapters`);
      } else {
        setChapters([]);
        addLog('No chapters found');
      }
    } catch (error) {
      addLog(`Error fetching chapters: ${error}`);
      setChapters([]);
    } finally {
      setLoading(false);
    }
  };

  const addChapter = async () => {
    if (!newChapterTitle.trim() || !selectedCourse) return;

    try {
      setLoading(true);
      addLog(`Adding chapter: "${newChapterTitle}" to course ${selectedCourse.id}`);

      const response = await fetch(`/api/courses/${selectedCourse.id}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newChapterTitle })
      });

      const data = await response.json();
      addLog(`Add chapter response: ${response.status}`);
      addLog(`Response data: ${JSON.stringify(data)}`);

      if (response.ok) {
        setNewChapterTitle('');
        addLog('Chapter added successfully, refreshing...');
        await fetchChapters(selectedCourse.id);
      } else {
        addLog(`Failed to add chapter: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      addLog(`Error adding chapter: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteChapter = async (chapterId: string) => {
    if (!selectedCourse) return;

    try {
      setLoading(true);
      addLog(`Deleting chapter ${chapterId}...`);

      const response = await fetch(`/api/courses/${selectedCourse.id}/chapters/${chapterId}`, {
        method: 'DELETE'
      });

      addLog(`Delete response: ${response.status}`);

      if (response.ok) {
        addLog('Chapter deleted successfully');
        await fetchChapters(selectedCourse.id);
      } else {
        const data = await response.json();
        addLog(`Failed to delete: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      addLog(`Error deleting chapter: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">章管理テストページ（シンプル版）</h1>

      {/* コース選択 */}
      <div className="mb-6 p-4 border rounded">
        <h2 className="text-lg font-semibold mb-3">1. コースを選択</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {courses.map(course => (
            <button
              key={course.id}
              onClick={() => selectCourse(course)}
              className={`p-3 text-left border rounded ${
                selectedCourse?.id === course.id
                  ? 'bg-blue-500 text-white'
                  : 'bg-white hover:bg-gray-50'
              }`}
            >
              <div className="font-medium">{course.title}</div>
              <div className="text-sm opacity-75">ID: {course.id}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 章の管理 */}
      {selectedCourse && (
        <div className="mb-6 p-4 border rounded">
          <h2 className="text-lg font-semibold mb-3">
            2. 章の管理 - {selectedCourse.title}
          </h2>

          {/* 新規追加 */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newChapterTitle}
              onChange={(e) => setNewChapterTitle(e.target.value)}
              placeholder="新しい章のタイトル"
              className="flex-1 p-2 border rounded"
              disabled={loading}
            />
            <button
              onClick={addChapter}
              disabled={loading || !newChapterTitle.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              章を追加
            </button>
            <button
              onClick={() => fetchChapters(selectedCourse.id)}
              disabled={loading}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
            >
              更新
            </button>
          </div>

          {/* 章一覧 */}
          <div className="space-y-2">
            {loading ? (
              <div className="text-center py-4">読み込み中...</div>
            ) : chapters.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                章がありません
              </div>
            ) : (
              chapters.map((chapter: any) => (
                <div key={chapter.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <div>
                    <div className="font-medium">{chapter.title}</div>
                    <div className="text-sm text-gray-500">
                      ID: {chapter.id} | Order: {chapter.display_order} | Videos: {chapter.video_ids?.length || 0}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteChapter(chapter.id)}
                    disabled={loading}
                    className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                  >
                    削除
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ログ表示 */}
      <div className="p-4 border rounded">
        <h2 className="text-lg font-semibold mb-3">デバッグログ</h2>
        <div className="bg-black text-green-400 p-3 rounded font-mono text-xs max-h-64 overflow-y-auto">
          {logs.length === 0 ? (
            <div>ログはまだありません</div>
          ) : (
            logs.map((log, index) => (
              <div key={index}>{log}</div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}