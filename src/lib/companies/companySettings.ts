// 会社ごとの設定（研修開始日・研修終了日）。どちらの日付も任意。
// 会社は受講者の会社名（user_profiles.company）でまとめているだけなので、会社名をキーにして company_settings に持つ。

import { fmtYmd, isValidDate } from '@/lib/records/workSchedule';

/** 研修期間。日付は 'YYYY-MM-DD'、未設定は null */
export type CompanyTrainingPeriod = {
  training_start_date: string | null;
  training_end_date: string | null;
};

/** 会社名 → 研修期間（どちらかの日付が入っている会社だけ） */
export type CompanyTrainingPeriodMap = Record<string, CompanyTrainingPeriod>;

/** 会社名が空の受講者をまとめる見出し（生徒管理の画面と同じ）。会社ではないので設定は持たない */
export const NO_COMPANY_LABEL = '個人';

const COMPANY_MAX_LENGTH = 200;

const toDateOrNull = (v: unknown): string | null | undefined => {
  if (v === null || v === undefined || v === '') return null;
  return isValidDate(v) ? v : undefined; // undefined＝形が正しくない
};

/** 保存の入力を確かめる（会社名はそのまま使う。user_profiles.company と同じ文字列でないと引けないため） */
export function parseCompanyTrainingPeriodInput(
  body: unknown
): { ok: true; company: string; period: CompanyTrainingPeriod } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const company = typeof b.company === 'string' ? b.company : '';
  if (!company.trim()) return { ok: false, error: '会社が指定されていません' };
  if (company.length > COMPANY_MAX_LENGTH) return { ok: false, error: '会社名が長すぎます' };

  const start = toDateOrNull(b.training_start_date);
  const end = toDateOrNull(b.training_end_date);
  if (start === undefined) return { ok: false, error: '研修開始日の日付が正しくありません' };
  if (end === undefined) return { ok: false, error: '研修終了日の日付が正しくありません' };
  if (start && end && start > end) {
    return { ok: false, error: '研修終了日は、研修開始日と同じ日か、それより後の日にしてください' };
  }
  return { ok: true, company, period: { training_start_date: start, training_end_date: end } };
}

/** 「2026/10/1 〜 2027/3/31」。片方だけなら「2026/10/1 〜」「〜 2027/3/31」。どちらも無ければ null */
export function trainingPeriodLabel(period: CompanyTrainingPeriod | null | undefined): string | null {
  const start = period?.training_start_date || null;
  const end = period?.training_end_date || null;
  if (!start && !end) return null;
  return `${start ? fmtYmd(start) : ''} 〜 ${end ? fmtYmd(end) : ''}`.trim();
}

/** company_settings の表がまだ無い（マイグレーション未適用）ときのエラーか */
export function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /Could not find the table|does not exist/i.test(error.message || '')
  );
}
