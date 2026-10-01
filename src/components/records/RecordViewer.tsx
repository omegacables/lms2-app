'use client';

// 実施記録（動画の視聴・小テスト・最終テストと添削）を画面で見る。PDF と同じ HTML（buildRecordHTML）を表示する。
// 管理者・講師・社労士で共通（社労士は API 側で担当会社の受講者だけに絞られる）。

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import {
  buildRecordHTML,
  generateLearningRecordPDFBlob,
  type LearningRecordData,
} from '@/lib/utils/learningRecordPDF';

export async function recordAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
  };
}

export async function fetchLearningRecord(userId: string, courseId: number): Promise<LearningRecordData> {
  const res = await fetch(
    `/api/admin/learning-record?userId=${encodeURIComponent(userId)}&courseId=${courseId}`,
    { headers: await recordAuthHeaders() }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || '記録の取得に失敗しました');
  return json as LearningRecordData;
}

export async function downloadLearningRecordPDF(data: LearningRecordData): Promise<void> {
  const { blob, fileName } = await generateLearningRecordPDFBlob(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RecordViewer({
  userId,
  courseId,
  title,
  onClose,
}: {
  userId: string;
  courseId: number;
  title?: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<LearningRecordData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetchLearningRecord(userId, courseId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, courseId]);

  // Esc で閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const downloadPdf = async () => {
    if (!data) return;
    setBusy(true);
    try {
      await downloadLearningRecordPDF(data);
    } catch (e) {
      alert('PDFの作成に失敗しました: ' + String(e));
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-2 sm:p-4" onClick={onClose}>
      <div
        className="mx-auto my-2 sm:my-4 w-full max-w-[860px] rounded-xl bg-white dark:bg-neutral-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || '実施記録'}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-xl border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-neutral-900 px-4 py-3">
          <div className="min-w-0 truncate font-semibold text-gray-900 dark:text-gray-100">{title || '実施記録'}</div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="outline" onClick={downloadPdf} disabled={!data} loading={busy}>
              PDF
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              閉じる
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto bg-gray-100 dark:bg-neutral-800 p-3 sm:p-4">
          {error ? (
            <p className="py-10 text-center text-sm text-red-600">{error}</p>
          ) : !data ? (
            <div className="flex justify-center py-16">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <div
              className="mx-auto w-fit bg-white py-6 shadow"
              // 受講者の回答などはすべて buildRecordHTML 内でエスケープ済み
              dangerouslySetInnerHTML={{ __html: buildRecordHTML(data) }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
