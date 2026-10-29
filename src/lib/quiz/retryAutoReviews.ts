// 作成に失敗した自動添削をまとめてやり直す。サーバー専用（service role クライアントを渡す）。
//
// 対象:
//   最終テスト … 最新の提出に添削がまだ無いもの（提出直後の自動添削が失敗して「添削待ち」に残ったもの）
//   小テスト   … quiz_auto_reviews が失敗（作成途中で止まったものを含む）のもの
// 受講者を待たせている最終テストを先に処理する。1回の呼び出しで時間内に終わる分だけ処理し、
// 残りは次の呼び出しで続ける（Vercel の実行時間の上限があるため）。

import type { SupabaseClient } from '@supabase/supabase-js';
import { effectiveStatus, generateQuizAutoReview, markAutoReviewPending } from '@/lib/quiz/autoReview';
import { generateFinalAutoReview } from '@/lib/quiz/autoFinalReview';

/** 提出・回答の直後は、提出時の自動添削がまだ動いている可能性があるので対象にしない */
const RECENT_MS = 10 * 60 * 1000;
/** 同時に作成する件数（1件で Gemini を2〜3回呼ぶ） */
const CONCURRENCY = 5;
/** 連続でこの件数失敗したら、API の上限や設定の問題とみなして中断する */
const MAX_CONSECUTIVE_FAILURES = 5;

export interface RetryTarget {
  kind: 'final' | 'quiz';
  quiz_id: number;
  user_id: string;
}

export interface RetryCounts {
  final: number;
  quiz: number;
}

export async function findRetryTargets(admin: SupabaseClient): Promise<RetryTarget[]> {
  const now = Date.now();

  // --- 最終テスト：最新の提出より新しい添削が無いもの ---
  const { data: reviewQuizzes } = await admin.from('quizzes').select('id').or('quiz_type.eq.essay,grading_mode.eq.review');
  const reviewQuizIds = (reviewQuizzes || []).map((q) => q.id);

  const finals: RetryTarget[] = [];
  if (reviewQuizIds.length > 0) {
    const [{ data: attempts }, { data: reviews }] = await Promise.all([
      admin.from('quiz_attempts').select('quiz_id, user_id, answered_at').in('quiz_id', reviewQuizIds).limit(20000),
      admin.from('essay_reviews').select('quiz_id, user_id, reviewed_at').in('quiz_id', reviewQuizIds).limit(20000),
    ]);
    const lastAttempt = new Map<string, number>();
    (attempts || []).forEach((a) => {
      const k = `${a.quiz_id}:${a.user_id}`;
      const t = new Date(a.answered_at).getTime();
      if (!lastAttempt.has(k) || t > lastAttempt.get(k)!) lastAttempt.set(k, t);
    });
    const lastReview = new Map<string, number>();
    (reviews || []).forEach((r) => {
      const k = `${r.quiz_id}:${r.user_id}`;
      const t = new Date(r.reviewed_at).getTime();
      if (!lastReview.has(k) || t > lastReview.get(k)!) lastReview.set(k, t);
    });
    lastAttempt.forEach((answeredAt, k) => {
      if (now - answeredAt < RECENT_MS) return;
      const reviewedAt = lastReview.get(k);
      if (reviewedAt !== undefined && reviewedAt >= answeredAt) return;
      const [quizId, userId] = k.split(':');
      finals.push({ kind: 'final', quiz_id: Number(quizId), user_id: userId });
    });
  }

  // --- 小テスト：失敗、または作成途中で止まったもの ---
  const { data: autoRows } = await admin
    .from('quiz_auto_reviews')
    .select('quiz_id, user_id, status, updated_at')
    .in('status', ['failed', 'pending'])
    .order('updated_at', { ascending: true })
    .limit(5000);
  // effectiveStatus は、作成中のまま一定時間たったものも失敗として返す
  const quizzes: RetryTarget[] = (autoRows || [])
    .filter((r) => effectiveStatus(r) === 'failed')
    .map((r) => ({ kind: 'quiz', quiz_id: r.quiz_id, user_id: r.user_id }));

  return [...finals, ...quizzes];
}

export function countTargets(targets: RetryTarget[]): RetryCounts {
  return {
    final: targets.filter((t) => t.kind === 'final').length,
    quiz: targets.filter((t) => t.kind === 'quiz').length,
  };
}

export interface RetryResult {
  succeeded: RetryCounts;
  failed: RetryCounts;
  /** 時間切れ・連続失敗で途中までにした場合の理由 */
  stopped: 'time' | 'failures' | null;
  lastError: string | null;
  remaining: RetryCounts;
}

/**
 * 失敗した自動添削を、budgetMs の間に始められる分だけ作り直す。
 * 始めた処理は最後まで待つので、呼び出し側の実行時間の上限は budgetMs より長くしておくこと。
 */
export async function retryFailedAutoReviews(admin: SupabaseClient, budgetMs: number): Promise<RetryResult> {
  const started = Date.now();
  const targets = await findRetryTargets(admin);

  const succeeded: RetryCounts = { final: 0, quiz: 0 };
  const failed: RetryCounts = { final: 0, quiz: 0 };
  let stopped: RetryResult['stopped'] = null;
  let lastError: string | null = null;
  let consecutiveFailures = 0;
  let next = 0;

  const worker = async () => {
    while (next < targets.length) {
      if (stopped) return;
      if (Date.now() - started > budgetMs) {
        stopped = 'time';
        return;
      }
      const t = targets[next++];
      let result: { ok: boolean; error?: string };
      if (t.kind === 'final') {
        result = await generateFinalAutoReview(admin, t.quiz_id, t.user_id);
        // 作成中に講師が返却した等で対象外になったものは失敗に数えない
        if (!result.ok && /添削済み|添削待ちの提出がありません/.test(result.error || '')) result = { ok: true };
      } else {
        await markAutoReviewPending(admin, t.quiz_id, t.user_id);
        result = await generateQuizAutoReview(admin, t.quiz_id, t.user_id);
        if (!result.ok && !lastError) {
          // 小テストは詳しい理由が quiz_auto_reviews.error に残る
          const { data: row } = await admin
            .from('quiz_auto_reviews')
            .select('error')
            .eq('quiz_id', t.quiz_id)
            .eq('user_id', t.user_id)
            .maybeSingle();
          if (row?.error) result.error = row.error;
        }
      }

      if (result.ok) {
        succeeded[t.kind]++;
        consecutiveFailures = 0;
      } else {
        failed[t.kind]++;
        lastError = (result.error || '').slice(0, 300) || lastError;
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) stopped = 'failures';
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

  const remaining = countTargets(await findRetryTargets(admin));
  return { succeeded, failed, stopped, lastError, remaining };
}
