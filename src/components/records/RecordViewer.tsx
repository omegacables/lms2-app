'use client';

// テスト実施記録（小テスト・最終テストと添削）を画面で見る。PDF と同じ HTML（buildRecordHTML）を表示する。
// 管理者・講師・社労士で共通（社労士は API 側で担当会社の受講者だけに絞られる）。
// editable（管理者・講師）のときは「日付・就業日」で回答日の修正と就業日・就業時間の設定ができる。

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { recordAuthHeaders } from '@/components/records/recordApi';
import { RecordEditPanel } from '@/components/records/RecordEditPanel';
import {
  buildRecordHTML,
  generateLearningRecordPDFBlob,
  type LearningRecordData,
} from '@/lib/utils/learningRecordPDF';

export { recordAuthHeaders };

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
  editable = false,
}: {
  userId: string;
  courseId: number;
  title?: string;
  onClose: () => void;
  /** 回答日の修正・就業日の設定ができる（管理者・講師） */
  editable?: boolean;
}) {
  const [data, setData] = useState<LearningRecordData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setData(null);
    setError(null);
  }, [userId, courseId]);

  // 編集のあとは表示を残したまま読み直す
  useEffect(() => {
    let cancelled = false;
    fetchLearningRecord(userId, courseId)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, courseId, version]);

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
        aria-label={title || 'テスト実施記録'}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-xl border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-neutral-900 px-4 py-3">
          <div className="min-w-0 truncate font-semibold text-gray-900 dark:text-gray-100">{title || 'テスト実施記録'}</div>
          <div className="flex shrink-0 items-center gap-2">
            {editable && (
              <Button
                size="sm"
                variant={editing ? 'primary' : 'outline'}
                onClick={() => setEditing((v) => !v)}
                disabled={!data}
                aria-pressed={editing}
              >
                日付・就業日
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={downloadPdf} disabled={!data} loading={busy}>
              PDF
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              閉じる
            </Button>
          </div>
        </div>
        {editable && editing && data && (
          <RecordEditPanel userId={userId} data={data} onChanged={() => setVersion((v) => v + 1)} />
        )}
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
