'use client';

// 会社ごとの研修期間（研修開始日・研修終了日）を設定するモーダル。生徒管理の会社見出しから開く。
// どちらの日付も任意。両方を空にして保存すると未設定に戻る。

import { useEffect, useId, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { recordAuthHeaders } from '@/components/records/recordApi';
import type { CompanyTrainingPeriod } from '@/lib/companies/companySettings';

const inputCls =
  'w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-gray-900 dark:text-white';

export function CompanyTrainingPeriodModal({
  company,
  initial,
  onClose,
  onSaved,
}: {
  company: string;
  /** 今の設定（未設定なら null） */
  initial: CompanyTrainingPeriod | null;
  onClose: () => void;
  /** 保存できたときに呼ぶ。未設定に戻したときは null */
  onSaved: (period: CompanyTrainingPeriod | null) => void;
}) {
  const [start, setStart] = useState(initial?.training_start_date || '');
  const [end, setEnd] = useState(initial?.training_end_date || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const startId = useId();
  const endId = useId();

  const hasSetting = Boolean(initial?.training_start_date || initial?.training_end_date);
  const wrongOrder = Boolean(start && end && start > end);
  const unchanged = start === (initial?.training_start_date || '') && end === (initial?.training_end_date || '');

  const close = () => {
    if (!busy) onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const save = async (nextStart: string, nextEnd: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/company-settings', {
        method: 'PUT',
        headers: await recordAuthHeaders(),
        body: JSON.stringify({
          company,
          training_start_date: nextStart || null,
          training_end_date: nextEnd || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '保存に失敗しました');
      onSaved(nextStart || nextEnd ? { training_start_date: nextStart || null, training_end_date: nextEnd || null } : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    if (!confirm(`${company} の研修期間を消して、未設定に戻します。よろしいですか？`)) return;
    save('', '');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white dark:bg-neutral-900 w-full sm:max-w-md sm:rounded-lg shadow-xl rounded-t-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-neutral-800">
          <div>
            <h3 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-white">
              研修期間の設定
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{company}</p>
          </div>
          <button
            onClick={close}
            disabled={busy}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-neutral-800"
            aria-label="閉じる"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            どちらも任意です。片方だけでも保存できます。空にして保存すると未設定に戻ります。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor={startId} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                研修開始日
              </label>
              <input
                id={startId}
                type="date"
                className={inputCls}
                value={start}
                max={end || undefined}
                disabled={busy}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={endId} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                研修終了日
              </label>
              <input
                id={endId}
                type="date"
                className={inputCls}
                value={end}
                min={start || undefined}
                disabled={busy}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
          {wrongOrder && (
            <p className="text-xs text-red-600" role="alert">
              研修終了日は、研修開始日と同じ日か、それより後の日にしてください。
            </p>
          )}
          {error && (
            <p className="text-xs text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3 border-t border-gray-200 dark:border-neutral-800">
          <div>
            {hasSetting && (
              <Button variant="outline" onClick={reset} disabled={busy} className="text-red-600 border-red-300 hover:bg-red-50">
                未設定に戻す
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={close} disabled={busy}>
              キャンセル
            </Button>
            <Button onClick={() => save(start, end)} loading={busy} disabled={busy || wrongOrder || unchanged}>
              保存
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
