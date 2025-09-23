'use client';

import { useState, useEffect } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/database/supabase';
import {
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChartBarIcon,
  TrophyIcon,
  FireIcon,
  PlayIcon
} from '@heroicons/react/24/outline';

interface AttendanceRecord {
  date: string;
  videosWatched: number;
  totalWatchTime: number;
  coursesAccessed: number;
  status: 'active' | 'inactive';
  completedVideos: number;
}

interface AttendanceStats {
  totalDays: number;
  activeDays: number;
  attendanceRate: number;
  currentStreak: number;
  longestStreak: number;
  averageWatchTime: number;
  totalVideosCompleted: number;
}

export default function AttendancePage() {
  const { user } = useAuth();
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  useEffect(() => {
    if (user) {
      fetchAttendanceData();
    }
  }, [user, selectedMonth]);

  const fetchAttendanceData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // 選択された月の開始日と終了日を取得
      const startOfMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
      const endOfMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);

      // その月のすべての視聴ログを取得
      const { data: viewLogs } = await supabase
        .from('video_view_logs')
        .select(`
          *,
          videos!inner(title, course_id),
          courses!inner(title)
        `)
        .eq('user_id', user.id)
        .gte('last_updated', startOfMonth.toISOString())
        .lte('last_updated', endOfMonth.toISOString())
        .order('last_updated', { ascending: true });

      // 日別のデータを集計
      const dailyData = new Map<string, {
        videosWatched: Set<number>;
        totalWatchTime: number;
        coursesAccessed: Set<number>;
        completedVideos: number;
      }>();

      viewLogs?.forEach(log => {
        const date = new Date(log.last_updated).toDateString();
        
        if (!dailyData.has(date)) {
          dailyData.set(date, {
            videosWatched: new Set(),
            totalWatchTime: 0,
            coursesAccessed: new Set(),
            completedVideos: 0
          });
        }
        
        const dayData = dailyData.get(date)!;
        dayData.videosWatched.add(log.video_id);
        dayData.totalWatchTime += log.total_watched_time;
        dayData.coursesAccessed.add(log.course_id);
        
        if (log.status === 'completed') {
          dayData.completedVideos++;
        }
      });

      // 月の各日について出席記録を作成
      const records: AttendanceRecord[] = [];
      const currentDate = new Date(startOfMonth);
      
      while (currentDate <= endOfMonth) {
        const dateStr = currentDate.toDateString();
        const dayData = dailyData.get(dateStr);
        
        records.push({
          date: currentDate.toISOString(),
          videosWatched: dayData?.videosWatched.size || 0,
          totalWatchTime: dayData?.totalWatchTime || 0,
          coursesAccessed: dayData?.coursesAccessed.size || 0,
          status: dayData && dayData.videosWatched.size > 0 ? 'active' : 'inactive',
          completedVideos: dayData?.completedVideos || 0
        });
        
        currentDate.setDate(currentDate.getDate() + 1);
      }

      setAttendanceRecords(records);

      // 統計を計算
      const activeDays = records.filter(r => r.status === 'active').length;
      const attendanceRate = Math.round((activeDays / records.length) * 100);
      
      // ストリークを計算
      let currentStreak = 0;
      let longestStreak = 0;
      let tempStreak = 0;
      
      // 今日から遡ってストリークを計算
      const today = new Date();
      for (let i = records.length - 1; i >= 0; i--) {
        const recordDate = new Date(records[i].date);
        if (recordDate > today) continue; // 未来の日付はスキップ
        
        if (records[i].status === 'active') {
          tempStreak++;
          longestStreak = Math.max(longestStreak, tempStreak);
          if (currentStreak === 0 && recordDate.toDateString() === today.toDateString()) {
            currentStreak = tempStreak;
          }
        } else {
          if (currentStreak === 0) {
            currentStreak = tempStreak;
          }
          tempStreak = 0;
        }
      }

      const averageWatchTime = activeDays > 0 
        ? Math.round(records.reduce((sum, r) => sum + r.totalWatchTime, 0) / activeDays)
        : 0;

      const totalVideosCompleted = records.reduce((sum, r) => sum + r.completedVideos, 0);

      setStats({
        totalDays: records.length,
        activeDays,
        attendanceRate,
        currentStreak,
        longestStreak,
        averageWatchTime,
        totalVideosCompleted
      });

    } catch (error) {
      console.error('出席データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getStatusColor = (status: 'active' | 'inactive') => {
    return status === 'active' 
      ? 'bg-green-100 text-green-800 border-green-200' 
      : 'bg-gray-100 dark:bg-neutral-900 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-neutral-800';
  };

  const getStatusIcon = (status: 'active' | 'inactive') => {
    return status === 'active' 
      ? <CheckCircleIcon className="w-4 h-4" />
      : <XCircleIcon className="w-4 h-4" />;
  };

  const previousMonth = () => {
    setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    const next = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1);
    if (next <= new Date()) {
      setSelectedMonth(next);
    }
  };

  const resetToCurrentMonth = () => {
    setSelectedMonth(new Date());
  };

  const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
  
  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">学習出席状況</h1>
            <p className="text-gray-600 dark:text-gray-400">日々の学習活動を追跡し、学習習慣を確認できます</p>
          </div>

          {loading ? (
            <div className="flex justify-center items-center min-h-64">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <div className="space-y-8">
              {/* Stats Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/200 rounded-xl flex items-center justify-center">
                      <ChartBarIcon className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-blue-600 mb-1">
                    {stats?.attendanceRate || 0}%
                  </div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">出席率</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {stats?.activeDays || 0}/{stats?.totalDays || 0} 日間
                  </p>
                </div>

                <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center">
                      <FireIcon className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-orange-600 mb-1">
                    {stats?.currentStreak || 0}日
                  </div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">現在のストリーク</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    最長: {stats?.longestStreak || 0}日
                  </p>
                </div>

                <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-green-50 dark:bg-green-900/200 rounded-xl flex items-center justify-center">
                      <ClockIcon className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-green-600 mb-1">
                    {formatTime(stats?.averageWatchTime || 0)}
                  </div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">平均学習時間</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">1日あたり</p>
                </div>

                <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center">
                      <TrophyIcon className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-purple-600 mb-1">
                    {stats?.totalVideosCompleted || 0}
                  </div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">完了動画数</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">今月完了</p>
                </div>
              </div>

              {/* Calendar */}
              <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {selectedMonth.getFullYear()}年{selectedMonth.getMonth() + 1}月
                  </h2>
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={previousMonth}
                    >
                      &lt;
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={resetToCurrentMonth}
                    >
                      今月
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={nextMonth}
                      disabled={selectedMonth.getMonth() >= new Date().getMonth() && selectedMonth.getFullYear() >= new Date().getFullYear()}
                    >
                      &gt;
                    </Button>
                  </div>
                </div>

                {/* Calendar Header */}
                <div className="grid grid-cols-7 gap-2 mb-4">
                  {weekDays.map(day => (
                    <div key={day} className="text-center text-sm font-medium text-gray-500 dark:text-gray-400 py-2">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-2">
                  {/* Empty cells for days before month starts */}
                  {Array.from({ length: new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1).getDay() }, (_, i) => (
                    <div key={`empty-${i}`} className="h-16"></div>
                  ))}
                  
                  {/* Days of the month */}
                  {attendanceRecords.map((record, index) => {
                    const date = new Date(record.date);
                    const isToday = date.toDateString() === new Date().toDateString();
                    const isFuture = date > new Date();
                    
                    return (
                      <div
                        key={index}
                        className={`h-16 border-2 rounded-lg p-2 ${
                          isFuture 
                            ? 'border-gray-100 bg-gray-50 dark:bg-black' 
                            : `border-2 ${getStatusColor(record.status)} ${isToday ? 'ring-2 ring-blue-300' : ''}`
                        }`}
                      >
                        <div className="flex items-center justify-between h-full">
                          <div>
                            <div className={`text-sm font-medium ${isFuture ? 'text-gray-400' : ''}`}>
                              {date.getDate()}
                            </div>
                            {!isFuture && record.status === 'active' && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {record.videosWatched}動画
                              </div>
                            )}
                          </div>
                          {!isFuture && (
                            <div className="flex items-center">
                              {getStatusIcon(record.status)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex items-center justify-center space-x-6 mt-6 pt-6 border-t border-gray-200 dark:border-neutral-800">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-green-100 border-2 border-green-200 rounded"></div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">学習した日</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-gray-100 dark:bg-neutral-900 border-2 border-gray-200 dark:border-neutral-800 rounded"></div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">学習しなかった日</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-blue-100 border-2 border-blue-300 rounded ring-2 ring-blue-300"></div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">今日</span>
                  </div>
                </div>
              </div>

              {/* Detailed Records */}
              <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800">
                <div className="p-6 border-b border-gray-200 dark:border-neutral-800">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">詳細な学習記録</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">日々の学習活動の詳細</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 dark:bg-black">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          日付
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          ステータス
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          視聴動画数
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          完了動画数
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          学習時間
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          アクセスコース数
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200">
                      {attendanceRecords
                        .filter(record => record.status === 'active' || new Date(record.date) <= new Date())
                        .reverse()
                        .slice(0, 10)
                        .map((record, index) => {
                          const date = new Date(record.date);
                          const isToday = date.toDateString() === new Date().toDateString();
                          
                          return (
                            <tr key={index} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${isToday ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                {date.toLocaleDateString('ja-JP', { 
                                  year: 'numeric', 
                                  month: 'short', 
                                  day: 'numeric',
                                  weekday: 'short'
                                })}
                                {isToday && (
                                  <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    今日
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border-2 ${getStatusColor(record.status)}`}>
                                  {getStatusIcon(record.status)}
                                  <span className="ml-1">
                                    {record.status === 'active' ? '学習済み' : '未学習'}
                                  </span>
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {record.videosWatched > 0 ? `${record.videosWatched}本` : '-'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {record.completedVideos > 0 ? `${record.completedVideos}本` : '-'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {record.totalWatchTime > 0 ? formatTime(record.totalWatchTime) : '-'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {record.coursesAccessed > 0 ? `${record.coursesAccessed}コース` : '-'}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}