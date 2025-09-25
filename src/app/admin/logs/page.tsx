'use client';

import { useState, useEffect } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { supabase } from '@/lib/database/supabase';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ClockIcon,
  UserIcon,
  VideoCameraIcon,
  AcademicCapIcon,
  CalendarIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';

interface ViewLog {
  id: number;
  user_id: string;
  video_id: number;
  course_id: number;
  current_position: number;
  total_watched_time: number;
  progress_percent: number;
  status: 'not_started' | 'in_progress' | 'completed';
  completed_at: string | null;
  last_updated: string;
  created_at: string;
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<ViewLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({
    start: '',
    end: ''
  });

  useEffect(() => {
    fetchLogs();
  }, [filterStatus, dateRange]);

  const fetchLogs = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('video_view_logs')
        .select('*')
        .order('last_updated', { ascending: false })
        .limit(100);

      // ステータスフィルター
      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      // 日付範囲フィルター
      if (dateRange.start) {
        query = query.gte('last_updated', dateRange.start);
      }
      if (dateRange.end) {
        query = query.lte('last_updated', dateRange.end);
      }

      const { data, error } = await query;

      if (error) {
        console.error('ログ取得エラー:', error);
        return;
      }

      setLogs(data || []);
    } catch (error) {
      console.error('ログ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}時間${minutes}分`;
    }
    return `${minutes}分`;
  };

  const getStatusBadge = (status: string) => {
    const statusMap = {
      'not_started': { label: '未開始', color: 'bg-gray-100 text-gray-800' },
      'in_progress': { label: '視聴中', color: 'bg-blue-100 text-blue-800' },
      'completed': { label: '完了', color: 'bg-green-100 text-green-800' }
    };
    const statusInfo = statusMap[status as keyof typeof statusMap] || statusMap['not_started'];
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
        {statusInfo.label}
      </span>
    );
  };

  const filteredLogs = logs.filter(log => {
    if (searchTerm) {
      return log.user_id.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  });

  return (
    <AuthGuard requiredRoles={['admin']}>
      <MainLayout>
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Link
                  href="/admin"
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                </Link>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">視聴ログ管理</h1>
                  <p className="text-gray-600 dark:text-gray-400">
                    すべての視聴ログを確認・管理できます
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  ステータス
                </label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="all">すべて</option>
                  <option value="not_started">未開始</option>
                  <option value="in_progress">視聴中</option>
                  <option value="completed">完了</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  開始日
                </label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  終了日
                </label>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  検索
                </label>
                <input
                  type="text"
                  placeholder="ユーザーID検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
            </div>
          </div>

          {/* Logs Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        ユーザー
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        コース/動画
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
                        更新日時
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          #{log.id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <UserIcon className="h-4 w-4 text-gray-400 mr-2" />
                            <span className="text-sm text-gray-900 dark:text-white">
                              {log.user_id.substring(0, 8)}...
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-white">
                            <div className="flex items-center">
                              <AcademicCapIcon className="h-4 w-4 text-gray-400 mr-1" />
                              Course {log.course_id}
                            </div>
                            <div className="flex items-center text-gray-500">
                              <VideoCameraIcon className="h-3 w-3 mr-1" />
                              Video {log.video_id}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-1 bg-gray-200 rounded-full h-2 mr-2 max-w-[100px]">
                              <div
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${log.progress_percent}%` }}
                              />
                            </div>
                            <span className="text-sm text-gray-900 dark:text-white">
                              {log.progress_percent}%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center text-sm text-gray-900 dark:text-white">
                            <ClockIcon className="h-4 w-4 text-gray-400 mr-1" />
                            {formatDuration(log.total_watched_time)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(log.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(log.last_updated).toLocaleString('ja-JP')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredLogs.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-gray-500">ログが見つかりません</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}