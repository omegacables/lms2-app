'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/database/supabase';

interface ProgressCardProps {
  courseId: string;
  courseName: string;
  userId: string;
}

export function ProgressCard({ courseId, courseName, userId }: ProgressCardProps) {
  const [progress, setProgress] = useState(0);
  const [completedVideos, setCompletedVideos] = useState(0);
  const [totalVideos, setTotalVideos] = useState(0);

  useEffect(() => {
    fetchProgress();
  }, [courseId, userId]);

  const fetchProgress = async () => {
    // コースの動画数を取得
    const { data: videos } = await supabase
      .from('videos')
      .select('id')
      .eq('course_id', courseId)
      .eq('status', 'active');

    const total = videos?.length || 0;
    setTotalVideos(total);

    // 完了した動画数を取得
    const { data: viewLogs } = await supabase
      .from('video_view_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .eq('status', 'completed');

    const completed = viewLogs?.length || 0;
    setCompletedVideos(completed);

    // 進捗率計算
    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
    setProgress(progressPercent);
  };

  return (
    <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-6 text-white shadow-lg dark:shadow-gray-900/50">
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-1">進捗率</h3>
        <p className="text-sm opacity-90">{courseName}</p>
      </div>

      <div className="mb-6">
        <div className="flex justify-between items-baseline mb-2">
          <span className="text-3xl font-bold">{completedVideos}</span>
          <span className="text-lg opacity-75">/ {totalVideos}本</span>
        </div>
        
        <div className="liquid-glass-interactive dark:bg-neutral-900/20 rounded-full h-3 overflow-hidden">
          <div 
            className="liquid-glass-interactive h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm opacity-90">全体の進捗率</span>
        <div className="relative w-16 h-16">
          <svg className="w-16 h-16 transform -rotate-90">
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="8"
              fill="none"
            />
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="rgba(255,255,255,0.9)"
              strokeWidth="8"
              fill="none"
              strokeDasharray={`${progress * 1.76} 176`}
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold">{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}