// 受講者の就業日・就業時間（定期の設定＋日ごとの例外）と、回答が就業時間の外かどうかの判定。
// テスト実施記録で、就業日・就業時間の外の回答日を赤字にするのに使う。サーバー・画面の両方で使う純粋な関数だけ置く。

import { isJapaneseHoliday } from '@/lib/records/jpHolidays';

export interface WorkSchedule {
  /** 出勤する曜日（0=日 1=月 … 6=土） */
  work_days: number[];
  /** 'HH:MM' */
  start_time: string;
  end_time: string;
  /** 祝日を休みにする */
  holidays_off: boolean;
}

export interface WorkException {
  /** 'YYYY-MM-DD' */
  work_date: string;
  /** true=出勤日 false=休み */
  is_workday: boolean;
  /** 出勤日の就業時間（null なら定期の就業時間） */
  start_time: string | null;
  end_time: string | null;
  note: string | null;
}

export const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
  work_days: [1, 2, 3, 4, 5],
  start_time: '09:00',
  end_time: '18:00',
  holidays_off: true,
};

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
/** 画面で並べる順（月〜日） */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** DB の time（'09:00:00'）→ 'HH:MM' */
export function normalizeTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = m[1].padStart(2, '0');
  const v = `${hh}:${m[2]}`;
  return TIME_RE.test(v) ? v : null;
}

export function isValidTime(t: unknown): t is string {
  return typeof t === 'string' && TIME_RE.test(t);
}

export function isValidDate(d: unknown): d is string {
  if (typeof d !== 'string' || !DATE_RE.test(d)) return false;
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d;
}

/** 日本時間の日付・時刻（日本は夏時間が無いので +9 時間でよい） */
export function jstParts(iso: string): { date: string; time: string } {
  const s = new Date(Date.parse(iso) + 9 * 3600 * 1000).toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}

/** 日本時間の今日 'YYYY-MM-DD' */
export function jstToday(): string {
  return jstParts(new Date().toISOString()).date;
}

export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** 'YYYY-MM-DD' → '2026/11/2'（これまでの記録の表記 toLocaleDateString('ja-JP') と同じ形） */
export function fmtYmd(date: string | null | undefined): string {
  if (!date || !DATE_RE.test(date)) return '—';
  const [y, m, d] = date.split('-');
  return `${Number(y)}/${Number(m)}/${Number(d)}`;
}

/** 'YYYY-MM-DD' → '2026/11/2（月）' */
export function fmtYmdWithDow(date: string | null | undefined): string {
  if (!date || !DATE_RE.test(date)) return '—';
  return `${fmtYmd(date)}（${WEEKDAY_LABELS[dayOfWeek(date)]}）`;
}

const stripZero = (t: string) => t.replace(/^0(\d):/, '$1:');

/** 「月〜金 9:00〜18:00・祝日休み」 */
export function scheduleSummary(s: WorkSchedule | null | undefined): string {
  if (!s) return '';
  const days = WEEKDAY_ORDER.filter((d) => s.work_days.includes(d));
  let dayText: string;
  if (days.length === 0) dayText = '出勤日なし';
  else if (days.length === 7) dayText = '毎日';
  else {
    // 月〜日の順で連続していれば「月〜金」のようにまとめる
    const idx = days.map((d) => WEEKDAY_ORDER.indexOf(d));
    const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
    dayText =
      contiguous && days.length >= 3
        ? `${WEEKDAY_LABELS[days[0]]}〜${WEEKDAY_LABELS[days[days.length - 1]]}`
        : days.map((d) => WEEKDAY_LABELS[d]).join('・');
  }
  return `${dayText} ${stripZero(s.start_time)}〜${stripZero(s.end_time)}${s.holidays_off ? '・祝日休み' : ''}`;
}

function withinHours(time: string, start: string, end: string): boolean {
  if (start === end) return true;
  // 日をまたぐ勤務（例 22:00〜06:00）
  if (end < start) return time >= start || time < end;
  return time >= start && time < end;
}

/**
 * 就業日・就業時間の外なら理由（「休日」「祝日」「就業時間外」）を返す。中なら null。
 * time が null（回答日を日付だけに修正した場合など）は、就業日かどうかだけを見る。
 */
export function offWorkReason(
  schedule: WorkSchedule | null | undefined,
  exceptions: Map<string, WorkException>,
  date: string,
  time: string | null
): string | null {
  if (!schedule) return null;
  let start = schedule.start_time;
  let end = schedule.end_time;

  const ex = exceptions.get(date);
  if (ex) {
    if (!ex.is_workday) return '休日';
    if (ex.start_time && ex.end_time) {
      start = ex.start_time;
      end = ex.end_time;
    }
  } else {
    if (schedule.holidays_off && isJapaneseHoliday(date)) return '祝日';
    if (!schedule.work_days.includes(dayOfWeek(date))) return '休日';
  }
  if (time && !withinHours(time, start, end)) return '就業時間外';
  return null;
}

/** DB の行 → WorkSchedule（不正な値は既定に寄せる） */
export function scheduleFromRow(row: any): WorkSchedule | null {
  if (!row) return null;
  const days = Array.isArray(row.work_days)
    ? Array.from(new Set((row.work_days as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))).sort()
    : DEFAULT_WORK_SCHEDULE.work_days;
  return {
    work_days: days,
    start_time: normalizeTime(row.start_time) || DEFAULT_WORK_SCHEDULE.start_time,
    end_time: normalizeTime(row.end_time) || DEFAULT_WORK_SCHEDULE.end_time,
    holidays_off: row.holidays_off !== false,
  };
}

export function exceptionFromRow(row: any): WorkException {
  return {
    work_date: String(row.work_date).slice(0, 10),
    is_workday: !!row.is_workday,
    start_time: normalizeTime(row.start_time),
    end_time: normalizeTime(row.end_time),
    note: row.note ?? null,
  };
}
