'use client';

import { useState, useEffect } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import {
  MagnifyingGlassIcon,
  TrashIcon,
  ArrowPathIcon,
  UserIcon,
  VideoCameraIcon,
  ClockIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

interface ViewingHistoryRecord {
  id: number;
  user_id: string;
  video_id: number;
  course_id: number;
  current_position: number;
  total_watched_time: number;
  progress_percent: number;
  status: 'not_started' | 'in_progress' | 'completed';
  start_time: string;
  end_time: string;
  last_updated: string;
  user_profiles: { display_name: string };
  videos: { title: string };
  courses: { title: string };
}

interface User {
  id: string;
  display_name: string;
}

interface Course {
  id: number;
  title: string;
}

export default function ViewingHistoryPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<ViewingHistoryRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [selectedRecords, setSelectedRecords] = useState<number[]>([]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchViewingHistory();
  }, [selectedUser, selectedCourse]);

  const fetchInitialData = async () => {
    try {
      // Fetch users
      const { data: usersData } = await supabase
        .from('user_profiles')
        .select('id, display_name')
        .order('display_name');
      
      // Fetch courses
      const { data: coursesData } = await supabase
        .from('courses')
        .select('id, title')
        .order('title');

      setUsers(usersData || []);
      setCourses(coursesData || []);

    } catch (error) {
      console.error('初期データ取得エラー:', error);
    }
  };

  const fetchViewingHistory = async () => {
    try {
      setLoading(true);
      
      const url = new URL('/api/admin/viewing-history', window.location.origin);
      if (selectedUser) url.searchParams.set('userId', selectedUser);
      if (selectedCourse) url.searchParams.set('courseId', selectedCourse);

      const response = await fetch(url.toString());
      const result = await response.json();

      if (response.ok) {
        setRecords(result.data || []);
      } else {
        console.error('視聴履歴取得エラー:', result.error);
      }
    } catch (error) {
      console.error('視聴履歴取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResetSingle = async (userId: string, videoId: number) => {
    if (!confirm('この視聴履歴をリセットしますか？\nこの操作は取り消すことができません。')) {
      return;
    }

    try {
      const url = new URL('/api/admin/viewing-history', window.location.origin);
      url.searchParams.set('userId', userId);
      url.searchParams.set('videoId', videoId.toString());

      const response = await fetch(url.toString(), {
        method: 'DELETE'
      });

      if (response.ok) {
        await fetchViewingHistory();
        alert('視聴履歴をリセットしました');
      } else {
        const result = await response.json();
        alert(`エラー: ${result.error}`);
      }
    } catch (error) {
      console.error('視聴履歴リセットエラー:', error);
      alert('視聴履歴のリセットに失敗しました');
    }
  };

  const handleBulkReset = async () => {
    if (selectedRecords.length === 0) {
      alert('リセットする項目を選択してください');
      return;
    }

    if (!confirm(`選択した${selectedRecords.length}件の視聴履歴をリセットしますか？\nこの操作は取り消すことができません。`)) {
      return;
    }

    try {
      // Group by user for efficient reset
      const recordsByUser = new Map<string, number[]>();
      
      selectedRecords.forEach(recordId => {
        const record = records.find(r => r.id === recordId);
        if (record) {
          if (!recordsByUser.has(record.user_id)) {
            recordsByUser.set(record.user_id, []);
          }
          recordsByUser.get(record.user_id)!.push(record.video_id);
        }
      });

      // Reset for each user
      for (const [userId, videoIds] of recordsByUser) {
        const response = await fetch('/api/admin/viewing-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, videoIds })
        });

        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error);
        }
      }

      await fetchViewingHistory();
      setSelectedRecords([]);
      alert('選択した視聴履歴をリセットしました');
      
    } catch (error) {
      console.error('一括リセットエラー:', error);
      alert('一括リセットに失敗しました');
    }
  };

  const handleUserReset = async (userId: string) => {
    const userName = users.find(u => u.id === userId)?.display_name || 'ユーザー';
    
    if (!confirm(`${userName}さんの全ての視聴履歴をリセットしますか？\nこの操作は取り消すことができません。`)) {
      return;
    }

    try {
      const response = await fetch('/api/admin/viewing-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId,
          courseId: selectedCourse || undefined
        })
      });

      if (response.ok) {
        await fetchViewingHistory();
        alert(`${userName}さんの視聴履歴をリセットしました`);
      } else {
        const result = await response.json();
        alert(`エラー: ${result.error}`);
      }
    } catch (error) {
      console.error('ユーザー視聴履歴リセットエラー:', error);
      alert('ユーザーの視聴履歴リセットに失敗しました');
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes < 60) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">完了</span>;
      case 'in_progress':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">進行中</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-neutral-900 text-gray-800 dark:text-gray-200">未開始</span>;
    }
  };

  const filteredRecords = records.filter(record =>
    record.user_profiles?.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.videos?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.courses?.title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleSelectRecord = (recordId: number) => {
    setSelectedRecords(prev =>
      prev.includes(recordId)
        ? prev.filter(id => id !== recordId)
        : [...prev, recordId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedRecords.length === filteredRecords.length) {
      setSelectedRecords([]);
    } else {
      setSelectedRecords(filteredRecords.map(r => r.id));
    }
  };

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">視聴履歴管理</h1>
            <p className="text-gray-600 dark:text-gray-400">ユーザーの動画視聴履歴を確認・管理できます</p>
          </div>

          {/* Filters */}
          <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  ユーザー検索
                </label>
                <div className="relative">
                  <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="ユーザー名、動画名、コース名で検索..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  ユーザーフィルター
                </label>
                <select
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                >
                  <option value="">全てのユーザー</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  コースフィルター
                </label>
                <select
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                >
                  <option value="">全てのコース</option>
                  {courses.map(course => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <Button onClick={fetchViewingHistory} className="w-full">
                  <ArrowPathIcon className="h-4 w-4 mr-2" />
                  更新
                </Button>
              </div>
            </div>
          </div>

          {/* Actions */}
          {selectedRecords.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-800">
                  {selectedRecords.length}件選択中
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedRecords([])}
                  >
                    選択解除
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleBulkReset}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    <TrashIcon className="h-4 w-4 mr-1" />
                    一括リセット
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Viewing History Table */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="text-center py-12">
                <ChartBarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  視聴履歴がありません
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  フィルターを調整して再度検索してください
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 dark:bg-black">
                    <tr>
                      <th className="w-4 px-6 py-3">
                        <input
                          type="checkbox"
                          checked={selectedRecords.length === filteredRecords.length}
                          onChange={toggleSelectAll}
                          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 shadow-sm dark:shadow-gray-900/20 focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        ユーザー
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        コース
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        動画
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        進捗
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        視聴時間
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        ステータス
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        視聴開始
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        視聴終了
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        アクション
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200">
                    {filteredRecords.map((record) => (
                      <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedRecords.includes(record.id)}
                            onChange={() => toggleSelectRecord(record.id)}
                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 shadow-sm dark:shadow-gray-900/20 focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <UserIcon className="h-4 w-4 text-gray-400 mr-2" />
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {record.user_profiles?.display_name || 'Unknown User'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {record.courses?.title || 'Unknown Course'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <VideoCameraIcon className="h-4 w-4 text-gray-400 mr-2" />
                            <span className="text-sm text-gray-900 dark:text-white max-w-xs truncate">
                              {record.videos?.title || 'Unknown Video'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-16 bg-gray-200 rounded-full h-1 mr-2">
                              <div 
                                className="bg-blue-600 h-1 rounded-full"
                                style={{ width: `${record.progress_percent}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {record.progress_percent}%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                            <ClockIcon className="h-4 w-4 mr-1" />
                            {formatTime(record.total_watched_time)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(record.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {record.start_time ? new Date(record.start_time).toLocaleString('ja-JP', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {record.end_time ? new Date(record.end_time).toLocaleString('ja-JP', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleResetSingle(record.user_id, record.video_id)}
                            className="text-red-600 hover:text-red-900"
                            title="視聴履歴をリセット"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          {selectedUser && (
            <div className="mt-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-yellow-800">
                    ユーザー操作
                  </h4>
                  <p className="text-sm text-yellow-700">
                    {users.find(u => u.id === selectedUser)?.display_name}さんの操作
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleUserReset(selectedUser)}
                  className="bg-yellow-600 hover:bg-yellow-700"
                >
                  <TrashIcon className="h-4 w-4 mr-1" />
                  全履歴をリセット
                </Button>
              </div>
            </div>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}