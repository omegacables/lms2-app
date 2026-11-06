// テスト実施記録の回答日：回答・提出1回ごと（全設問が同じ answered_at）にまとめ、
// 実施記録に載せる日付（修正があれば修正後）と、就業日・就業時間の外かどうかを決める。

import {
  jstParts,
  offWorkReason,
  type WorkException,
  type WorkSchedule,
} from '@/lib/records/workSchedule';

export interface AnswerDateEntry {
  quiz_id: number;
  quiz_title: string;
  kind: 'small' | 'final';
  attempt_no: number;
  /** 元の回答日時（quiz_attempts.answered_at そのまま。修正の対象を指すのに使う） */
  answered_at: string;
  /** 元の回答日・時刻（日本時間） */
  original_date: string;
  original_time: string;
  /** 実施記録に載せる日付（修正があれば修正後） */
  date: string;
  correction: { corrected_date: string; reason: string; corrected_by_name: string; corrected_at: string } | null;
  /** 就業日・就業時間の外なら理由 */
  off_reason: string | null;
}

export interface CorrectionRow {
  quiz_id: number;
  answered_at: string;
  corrected_date: string | null;
  reason: string;
  corrected_by_name: string | null;
  corrected_at: string;
}

/** 1回の回答・提出を表すキー（DB の時刻表記の違いに左右されないよう、ミリ秒に直して比べる） */
export const submissionKey = (quizId: number, answeredAt: string) => `${quizId}:${Date.parse(answeredAt)}`;

export function createAnswerDateResolver(opts: {
  schedule: WorkSchedule | null;
  exceptions: WorkException[];
  /** 古い順（同じ回答への最新の行が有効） */
  corrections: CorrectionRow[];
}) {
  const exceptionMap = new Map(opts.exceptions.map((e) => [e.work_date, e]));
  const correctionMap = new Map<string, CorrectionRow>();
  for (const c of opts.corrections) correctionMap.set(submissionKey(c.quiz_id, c.answered_at), c);

  const entries: AnswerDateEntry[] = [];

  /** テスト1つ分の回答を登録し、回答（answered_at）→ 表示用の日付情報 を返す関数を返す */
  const add = (
    quiz: { id: number; title: string },
    kind: 'small' | 'final',
    attempts: { attempt_no: number; answered_at: string | null }[]
  ) => {
    const byKey = new Map<string, AnswerDateEntry>();
    const sorted = attempts
      .filter((a): a is { attempt_no: number; answered_at: string } => !!a.answered_at)
      .sort((x, y) => Date.parse(x.answered_at) - Date.parse(y.answered_at));
    for (const a of sorted) {
      const key = submissionKey(quiz.id, a.answered_at);
      const hit = byKey.get(key);
      if (hit) {
        hit.attempt_no = Math.min(hit.attempt_no, a.attempt_no);
        continue;
      }
      const orig = jstParts(a.answered_at);
      const c = correctionMap.get(key);
      const corrected = c?.corrected_date ? String(c.corrected_date).slice(0, 10) : null;
      const date = corrected || orig.date;
      byKey.set(key, {
        quiz_id: quiz.id,
        quiz_title: quiz.title,
        kind,
        attempt_no: a.attempt_no,
        answered_at: a.answered_at,
        original_date: orig.date,
        original_time: orig.time,
        date,
        correction:
          corrected && c
            ? {
                corrected_date: corrected,
                reason: c.reason,
                corrected_by_name: c.corrected_by_name || '',
                corrected_at: c.corrected_at,
              }
            : null,
        // 日付を修正した回答は時刻が分からないので、就業日かどうかだけを見る
        off_reason: offWorkReason(opts.schedule, exceptionMap, date, corrected ? null : orig.time),
      });
    }
    entries.push(...byKey.values());
    return (answeredAt: string | null) => {
      const e = answeredAt ? byKey.get(submissionKey(quiz.id, answeredAt)) : undefined;
      return {
        answered_date: e?.date ?? null,
        date_corrected: !!e?.correction,
        off_reason: e?.off_reason ?? null,
      };
    };
  };

  return { add, entries };
}
