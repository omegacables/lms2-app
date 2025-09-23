import React from 'react';

interface ProgressBarProps {
  progress: number;
  className?: string;
  showLabel?: boolean;
  height?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'green' | 'yellow' | 'red';
}

export function ProgressBar({
  progress,
  className = '',
  showLabel = false,
  height = 'md',
  color = 'blue'
}: ProgressBarProps) {
  const heightClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4'
  };

  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500'
  };

  const progressColor = progress === 100 ? 'bg-green-500' : colorClasses[color];

  return (
    <div className={className}>
      {showLabel && (
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-600 dark:text-gray-400">進捗</span>
          <span className="font-medium text-gray-900 dark:text-white">{progress}%</span>
        </div>
      )}
      <div className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full ${heightClasses[height]} overflow-hidden`}>
        <div
          className={`${heightClasses[height]} rounded-full transition-all duration-300 ${progressColor}`}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
    </div>
  );
}