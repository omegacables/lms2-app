'use client';

// 受講者の就業日・就業時間（定期の設定＋日ごとの例外）を設定するフォーム。
// テスト実施記録で、就業日・就業時間の外の回答日を赤字にするのに使う。
// userIds が1名なら今の設定と例外日を読み込んで編集、複数名なら全員に同じ設定を上書き・例外日を追加する。

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { recordAuthHeaders } from '@/components/records/recordApi';
import {
  DEFAULT_WORK_SCHEDULE,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  fmtYmdWithDow,
  scheduleSummary,
  type WorkException,
  type WorkSchedule,
} from '@/lib/records/workSchedule';

const inputCls =
  'border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';

const stripSec = (t: string | null) => (t ? t.slice(0, 5) : '');

export function WorkScheduleForm({
  userIds,
  onSaved,
  prefillDate,
}: {
  userIds: string[];
  /** 保存・例外日の追加・削除のあと（記録の再読み込みなど） */
  onSaved?: () => void;
  /** 例外日の追加欄に入れる日付（記録の赤字の日から「例外日にする」を押したとき）。nonce が変わるたびに反映 */
  prefillDate?: { date: string; nonce: number } | null;
}) {
  const single = userIds.length === 1;
  const singleId = single ? userIds[0] : null;
  const [loaded, setLoaded] = useState(!single);
  const [saved, setSaved] = useState<WorkSchedule | null>(null);
  const [form, setForm] = useState<WorkSchedule>(DEFAULT_WORK_SCHEDULE);
  const [exceptions, setExceptions] = useState<WorkException[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // 例外日の追加欄
  const [exDate, setExDate] = useState('');
  const [exWorkday, setExWorkday] = useState(false);
  const [exStart, setExStart] = useState('');
  const [exEnd, setExEnd] = useState('');
  const [exNote, setExNote] = useState('');

  const load = useCallback(async () => {
    if (!singleId) return;
    try {
      const res = await fetch(`/api/admin/work-schedules?userId=${encodeURIComponent(singleId)}`, {
        headers: await recordAuthHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '読み込みに失敗しました');
      setSaved(json.schedule || null);
      setForm(json.schedule || DEFAULT_WORK_SCHEDULE);
      setExceptions(json.exceptions || []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
    setLoaded(true);
  }, [singleId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!prefillDate) return;
    setExDate(prefillDate.date);
    setExWorkday(true);
    setExStart('');
    setExEnd('');
  }, [prefillDate]);

  const toggleDay = (d: number) =>
    setForm((f) => ({
      ...f,
      work_days: f.work_days.includes(d) ? f.work_days.filter((x) => x !== d) : [...f.work_days, d].sort(),
    }));

  const saveSchedule = async () => {
    if (!single && !confirm(`選んだ ${userIds.length} 名の就業日・就業時間を、この内容で上書きします。よろしいですか？`)) return;
    setBusy('schedule');
    setMessage(null);
    try {
      const res = await fetch('/api/admin/work-schedules', {
        method: 'PUT',
        headers: await recordAuthHeaders(),
        body: JSON.stringify({ userIds, schedule: form }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '保存に失敗しました');
      setSaved(form);
      setMessage(single ? '就業日・就業時間を保存しました。' : `${json.count} 名に保存しました。`);
      onSaved?.();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };

  // リセット：定期の就業日・就業時間と例外日を消して未設定に戻す（時間外の判定もしなくなる）
  const resetSchedule = async () => {
    const who = single ? 'この受講者' : `選んだ ${userIds.length} 名`;
    if (
      !confirm(
        `${who}の就業日・就業時間と例外日をすべて消して、未設定に戻します。\n` +
          'テスト実施記録の赤字（時間外の判定）も出なくなります。回答日の修正記録は消えません。\nよろしいですか？'
      )
    )
      return;
    setBusy('reset');
    setMessage(null);
    try {
      const res = await fetch('/api/admin/work-schedules', {
        method: 'DELETE',
        headers: await recordAuthHeaders(),
        body: JSON.stringify({ userIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'リセットに失敗しました');
      setSaved(null);
      setForm(DEFAULT_WORK_SCHEDULE);
      setExceptions([]);
      setMessage(single ? '就業日・就業時間をリセットしました（未設定）。' : `${userIds.length} 名の就業日・就業時間をリセットしました（未設定）。`);
      onSaved?.();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };

  const addException = async () => {
    if (!exDate) {
      setMessage('例外にする日を選んでください。');
      return;
    }
    if (exWorkday && (!!exStart !== !!exEnd)) {
      setMessage('その日の就業時間は、始業・終業の両方を入れてください（空欄なら定期の就業時間）。');
      return;
    }
    setBusy('exception');
    setMessage(null);
    try {
      const res = await fetch('/api/admin/work-schedules/exceptions', {
        method: 'POST',
        headers: await recordAuthHeaders(),
        body: JSON.stringify({
          userIds,
          work_date: exDate,
          is_workday: exWorkday,
          start_time: exWorkday && exStart ? exStart : null,
          end_time: exWorkday && exEnd ? exEnd : null,
          note: exNote,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '保存に失敗しました');
      setMessage(single ? `${fmtYmdWithDow(exDate)} を例外日にしました。` : `${json.count} 名に ${fmtYmdWithDow(exDate)} の例外日を登録しました。`);
      setExDate('');
      setExNote('');
      setExStart('');
      setExEnd('');
      await load();
      onSaved?.();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };

  const removeException = async (date: string) => {
    setBusy(`del:${date}`);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/work-schedules/exceptions', {
        method: 'DELETE',
        headers: await recordAuthHeaders(),
        body: JSON.stringify({ userId: userIds[0], work_date: date }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '削除に失敗しました');
      await load();
      onSaved?.();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };

  if (!loaded) return <p className="text-sm text-gray-500">読み込み中…</p>;

  return (
    <div className="space-y-4 text-sm text-gray-800 dark:text-gray-200">
      {/* 定期の就業日・就業時間 */}
      <div className="space-y-3">
        {single && (
          <p className="text-xs text-gray-500">
            現在：{saved ? scheduleSummary(saved) : '未設定（時間外の判定はしていません）'}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 shrink-0 text-gray-600 dark:text-gray-300">出勤日</span>
          {WEEKDAY_ORDER.map((d) => (
            <label
              key={d}
              className={`inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-1 ${
                form.work_days.includes(d)
                  ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              <input type="checkbox" className="sr-only" checked={form.work_days.includes(d)} onChange={() => toggleDay(d)} />
              <span className={d === 0 ? 'text-red-600' : d === 6 ? 'text-blue-600' : ''}>{WEEKDAY_LABELS[d]}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 shrink-0 text-gray-600 dark:text-gray-300">就業時間</span>
          <input
            type="time"
            className={inputCls}
            value={form.start_time}
            onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
            aria-label="始業時刻"
          />
          <span>〜</span>
          <input
            type="time"
            className={inputCls}
            value={form.end_time}
            onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
            aria-label="終業時刻"
          />
          <label className="ml-2 inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={form.holidays_off}
              onChange={(e) => setForm((f) => ({ ...f, holidays_off: e.target.checked }))}
            />
            祝日は休み
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={saveSchedule} loading={busy === 'schedule'} disabled={!!busy}>
            {single ? '就業日・就業時間を保存' : `${userIds.length} 名に保存`}
          </Button>
          {/* 1名で何も設定していないときは出さない（消すものが無い） */}
          {(!single || saved || exceptions.length > 0) && (
            <Button size="sm" variant="outline" onClick={resetSchedule} loading={busy === 'reset'} disabled={!!busy}>
              {single ? 'リセット（未設定に戻す）' : `${userIds.length} 名をリセット`}
            </Button>
          )}
        </div>
      </div>

      {/* 例外日 */}
      <div className="space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
        <div className="font-medium">例外日（その日だけ休み・出勤・時間が違う）</div>
        {single && !saved ? (
          <p className="text-xs text-gray-500">先に定期の就業日・就業時間を保存してください。</p>
        ) : (
          <>
            {!single && (
              <p className="text-xs text-gray-500">
                選んだ {userIds.length} 名全員に追加します（同じ日の例外があれば置き換え）。個別の確認・削除は各受講者の実施記録の「日付・就業日」から行えます。
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" className={inputCls} value={exDate} onChange={(e) => setExDate(e.target.value)} aria-label="例外にする日" />
              <select
                className={inputCls}
                value={exWorkday ? 'work' : 'off'}
                onChange={(e) => setExWorkday(e.target.value === 'work')}
                aria-label="その日の扱い"
              >
                <option value="off">休み</option>
                <option value="work">出勤</option>
              </select>
              {exWorkday && (
                <>
                  <input type="time" className={inputCls} value={exStart} onChange={(e) => setExStart(e.target.value)} aria-label="その日の始業時刻" />
                  <span>〜</span>
                  <input type="time" className={inputCls} value={exEnd} onChange={(e) => setExEnd(e.target.value)} aria-label="その日の終業時刻" />
                </>
              )}
              <input
                className={`${inputCls} w-40`}
                value={exNote}
                onChange={(e) => setExNote(e.target.value)}
                placeholder="メモ（例：振替出勤）"
                maxLength={200}
                aria-label="メモ"
              />
              <Button size="sm" variant="outline" onClick={addException} loading={busy === 'exception'} disabled={!!busy}>
                追加
              </Button>
            </div>
            {exWorkday && <p className="text-xs text-gray-500">時間を空欄にすると、定期の就業時間で判定します。</p>}

            {single &&
              (exceptions.length === 0 ? (
                <p className="text-xs text-gray-500">例外日はありません。</p>
              ) : (
                <table className="text-sm">
                  <tbody>
                    {exceptions.map((ex) => (
                      <tr key={ex.work_date} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-1 pr-3 whitespace-nowrap">{fmtYmdWithDow(ex.work_date)}</td>
                        <td className="py-1 pr-3 whitespace-nowrap">
                          {ex.is_workday ? (
                            <span className="text-blue-700 dark:text-blue-300">
                              出勤{ex.start_time && ex.end_time ? ` ${stripSec(ex.start_time)}〜${stripSec(ex.end_time)}` : ''}
                            </span>
                          ) : (
                            <span className="text-gray-600 dark:text-gray-300">休み</span>
                          )}
                        </td>
                        <td className="py-1 pr-3 text-gray-500">{ex.note || ''}</td>
                        <td className="py-1">
                          <button
                            className="text-xs text-red-600 hover:underline disabled:opacity-50"
                            onClick={() => removeException(ex.work_date)}
                            disabled={!!busy}
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
          </>
        )}
      </div>

      {message && <p className="text-sm text-blue-700 dark:text-blue-300" role="status">{message}</p>}
    </div>
  );
}
