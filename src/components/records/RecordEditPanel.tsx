'use client';

// テスト実施記録の「日付・就業日」編集（管理者・講師）。
// テスト実施記録（PDF・表示）には回答日を載せていないので、回答日と就業時間外かどうかはここで確認する。
// - 回答日：テストの回答・提出1回ごとに、回答日を修正できる（理由が必須）。
//   回答ログ（quiz_attempts）は書き換えず、修正の記録（元の回答日・修正者・理由）を残す。
// - 就業日・就業時間：この受講者の定期の出勤日・就業時間と例外日。外れた回答日はこの一覧で赤字になる。

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { recordAuthHeaders } from '@/components/records/recordApi';
import { WorkScheduleForm } from '@/components/records/WorkScheduleForm';
import { fmtYmd, fmtYmdWithDow, jstParts, jstToday } from '@/lib/records/workSchedule';
import type { AnswerDateEntry, LearningRecordData } from '@/lib/utils/learningRecordPDF';

const inputCls =
  'border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';

const entryKey = (e: AnswerDateEntry) => `${e.quiz_id}:${e.answered_at}`;

function DateRow({
  entry,
  userId,
  onChanged,
  onMakeException,
}: {
  entry: AnswerDateEntry;
  userId: string;
  onChanged: () => void;
  onMakeException: (date: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(entry.date);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (correctedDate: string | null) => {
    if (!reason.trim()) {
      setError('修正の理由を入力してください（修正の記録に残ります）。');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/answer-date-corrections', {
        method: 'POST',
        headers: await recordAuthHeaders(),
        body: JSON.stringify({
          userId,
          quizId: entry.quiz_id,
          answeredAt: entry.answered_at,
          correctedDate,
          reason: reason.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '保存に失敗しました');
      setEditing(false);
      setReason('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  return (
    <tr className="border-b border-gray-100 align-top dark:border-gray-800">
      <td className="py-2 pr-3 min-w-[8rem]">
        <div className="font-medium">{entry.quiz_title}</div>
        <div className="text-xs text-gray-500">
          {entry.kind === 'final' ? '最終テスト' : '小テスト'}・{entry.attempt_no}回目
        </div>
      </td>
      <td className="py-2 pr-3 whitespace-nowrap text-gray-600 dark:text-gray-300">
        {fmtYmdWithDow(entry.original_date)} {entry.original_time}
      </td>
      <td className="py-2 pr-3">
        {editing ? (
          <div className="space-y-1.5">
            <input
              type="date"
              className={inputCls}
              value={date}
              max={jstToday()}
              onChange={(e) => setDate(e.target.value)}
              aria-label="修正後の回答日"
            />
            <input
              className={`${inputCls} w-full min-w-[14rem]`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="修正の理由（必須・修正の記録に残ります）"
              maxLength={500}
              aria-label="修正の理由"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => submit(date)} loading={busy} disabled={!date || date === entry.date}>
                保存
              </Button>
              {entry.correction && (
                <Button size="sm" variant="outline" onClick={() => submit(null)} disabled={busy}>
                  元の日付に戻す
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setDate(entry.date);
                  setError(null);
                }}
                disabled={busy}
              >
                やめる
              </Button>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        ) : (
          <div className="whitespace-nowrap">
            <span className={entry.off_reason ? 'font-bold text-red-600' : ''}>{fmtYmdWithDow(entry.date)}</span>
            {entry.correction && (
              <div className="mt-0.5 max-w-[16rem] whitespace-normal text-xs text-gray-500">
                修正済（{entry.correction.corrected_by_name || '—'}、{fmtYmd(jstParts(entry.correction.corrected_at).date)}）理由：
                {entry.correction.reason}
              </div>
            )}
          </div>
        )}
      </td>
      <td className="py-2 pr-3 whitespace-nowrap">
        {entry.off_reason ? (
          <span className="inline-block rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {entry.off_reason}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
      <td className="py-2 whitespace-nowrap">
        {!editing && (
          <div className="flex flex-col items-start gap-1">
            <button className="text-xs text-blue-700 hover:underline dark:text-blue-300" onClick={() => setEditing(true)}>
              日付を修正
            </button>
            {entry.off_reason && (
              <button
                className="text-xs text-blue-700 hover:underline dark:text-blue-300"
                onClick={() => onMakeException(entry.date)}
                title="この日を例外日（出勤日）として登録する"
              >
                この日を例外日に
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export function RecordEditPanel({
  userId,
  data,
  onChanged,
}: {
  userId: string;
  data: LearningRecordData;
  onChanged: () => void;
}) {
  const [prefill, setPrefill] = useState<{ date: string; nonce: number } | null>(null);
  const entries = data.answerDates || [];
  const offCount = entries.filter((e) => e.off_reason).length;

  return (
    <div className="space-y-6 border-b border-gray-200 bg-white px-4 py-4 text-gray-900 dark:border-gray-700 dark:bg-neutral-900 dark:text-gray-100">
      <section>
        <h3 className="mb-1 font-semibold">回答日</h3>
        <p className="mb-2 text-xs text-gray-500">
          テスト実施記録（PDF・表示）には回答日を載せていません。回答日と、就業日・就業時間の外かどうかは、この一覧で確認できます。回答日を修正すると、元の回答日・修正者・理由が修正の記録として残ります（回答の記録そのものは変わりません）。
          {data.workSchedule
            ? offCount > 0
              ? ` 就業日・就業時間の外の回答が ${offCount} 件あります（赤字）。`
              : ' 就業日・就業時間の外の回答はありません。'
            : ' 就業日・就業時間が未設定のため、時間外の判定はしていません。'}
        </p>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-500">テストの回答はまだありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-700">
                  <th className="py-1.5 pr-3">テスト</th>
                  <th className="py-1.5 pr-3">回答日時（記録）</th>
                  <th className="py-1.5 pr-3">回答日</th>
                  <th className="py-1.5 pr-3">判定</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <DateRow
                    key={`${entryKey(e)}:${e.date}`}
                    entry={e}
                    userId={userId}
                    onChanged={onChanged}
                    onMakeException={(date) => {
                      setPrefill({ date, nonce: Date.now() });
                      document.getElementById('work-schedule-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="work-schedule-form">
        <h3 className="mb-2 font-semibold">就業日・就業時間</h3>
        <WorkScheduleForm userIds={[userId]} onSaved={onChanged} prefillDate={prefill} />
      </section>
    </div>
  );
}
