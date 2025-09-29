'use client';

import { useEffect, useState } from 'react';

interface ClientOnlyDateProps {
  timestamp: string;
  className?: string;
}

export function ClientOnlyDate({ timestamp, className = '' }: ClientOnlyDateProps) {
  const [formattedDate, setFormattedDate] = useState<string>('');

  useEffect(() => {
    if (timestamp) {
      try {
        const date = new Date(timestamp);
        const formatted = date.toLocaleString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
        setFormattedDate(formatted);
      } catch (error) {
        console.error('Date formatting error:', error);
        setFormattedDate('日付不明');
      }
    }
  }, [timestamp]);

  if (!formattedDate) {
    return <span className={className}>読み込み中...</span>;
  }

  return <span className={className}>{formattedDate}</span>;
}