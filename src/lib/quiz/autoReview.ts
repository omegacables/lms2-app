// 小テストの自動添削（AI の赤ペン・コメント）。サーバー専用（service role クライアントを渡す）。
//
// - 受講者が小テスト（grading_mode='auto' の選択式）に回答すると、AI が設問ごとの赤ペンと講評を作り、
//   コースの担当講師の署名「講師　{名前}」で受講者にすぐ表示する。
// - 講師が内容を確認（必要なら修正）すると confirmed_by / confirmed_at が入る。受講者に見える署名は変えず、
//   確認の記録は管理画面と学習記録PDFに載せる（PDF には AI による自動添削であることも記載する）。
// - AI が作成した元の内容は ai_question_reviews / ai_review_comment に残す。

import type { SupabaseClient } from '@supabase/supabase-js';
import { geminiGenerateJSON, geminiModelName, isGeminiConfigured } from '@/lib/ai/gemini';
import { draftRedPen } from '@/lib/quiz/redpenDraft';
import { normalizeMarkup, type RedPenSegment } from '@/lib/quiz/redpen';
import { aiInstructorLabel, resolveCourseAiInstructor } from '@/lib/quiz/aiInstructors';

export type AutoReviewStatus = 'pending' | 'ready' | 'failed';

/** 設問ごとの自動添削 */
export interface AutoQuestionReview {
  question_id: number;
  /** 添削した時点の受講者の回答文 */
  answer_text: string;
  comment: string | null;
  markup: RedPenSegment[] | null;
}

/** 受講者・アプリに返す形 */
export interface AutoReviewView {
  status: AutoReviewStatus;
  comment: string | null;
  question_reviews: { question_id: number; comment: string | null; markup: RedPenSegment[] | null }[];
  generated_at: string | null;
  /** 担当講師の名前 */
  instructor_name: string | null;
  /** 署名（「講師　名前」） */
  signature: string;
  /** 講師が内容を確認済みか */
  confirmed: boolean;
  /** 確認した講師の名前（確認済みのときだけ） */
  reviewer_name: string | null;
  confirmed_at: string | null;
}

/** 作成中のまま一定時間たったものは失敗扱いにする（処理が途中で止まった場合） */
const STALE_PENDING_MS = 5 * 60 * 1000;

export function effectiveStatus(row: { status: string; updated_at: string | null }): AutoReviewStatus {
  if (row.status === 'pending' && row.updated_at) {
    const age = Date.now() - new Date(row.updated_at).getTime();
    if (age > STALE_PENDING_MS) return 'failed';
  }
  return (['pending', 'ready', 'failed'].includes(row.status) ? row.status : 'failed') as AutoReviewStatus;
}

/** 回答を受け付けた直後に「作成中」にする（前回の確認は内容が変わるので取り消す） */
export async function markAutoReviewPending(admin: SupabaseClient, quizId: number, userId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin.from('quiz_auto_reviews').upsert(
    {
      quiz_id: quizId,
      user_id: userId,
      status: 'pending',
      error: null,
      confirmed_by: null,
      confirmed_at: null,
      edited_at: null,
      updated_at: now,
    },
    { onConflict: 'quiz_id,user_id' }
  );
  if (error) console.error('[autoReview] pending upsert error:', error);
}

async function markFailed(admin: SupabaseClient, quizId: number, userId: string, message: string): Promise<void> {
  await admin
    .from('quiz_auto_reviews')
    .update({ status: 'failed', error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq('quiz_id', quizId)
    .eq('user_id', userId);
}

/** 並列数を絞って順に処理する */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * 受講者の最新の回答に対して自動添削を作成し、保存する。
 * 回答が無い場合は行を削除する。失敗したときは status='failed' で理由を残す（管理画面から作り直せる）。
 */
export async function generateQuizAutoReview(
  admin: SupabaseClient,
  quizId: number,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!isGeminiConfigured()) {
      await markFailed(admin, quizId, userId, 'AI が未設定です（GEMINI_API_KEY）');
      return { ok: false, error: 'AI が未設定です' };
    }

    const { data: quiz } = await admin
      .from('quizzes')
      .select('id, course_id, title, quiz_type, grading_mode')
      .eq('id', quizId)
      .single();
    if (!quiz || quiz.quiz_type !== 'choice' || quiz.grading_mode === 'review') {
      await markFailed(admin, quizId, userId, '自動添削の対象外のテストです');
      return { ok: false, error: '対象外のテストです' };
    }

    const { data: course } = await admin.from('courses').select('title').eq('id', quiz.course_id).single();
    const instructor = await resolveCourseAiInstructor(admin, quiz.course_id);

    const { data: questions } = await admin
      .from('quiz_questions')
      .select('id, question_text, choices, correct_index, explanation, sort_order')
      .eq('quiz_id', quizId)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    const { data: attempts } = await admin
      .from('quiz_attempts')
      .select('question_id, selected_index, answer_text, answered_at')
      .eq('quiz_id', quizId)
      .eq('user_id', userId)
      .order('answered_at', { ascending: false });
    const latest = new Map<number, { selected_index: number | null; answer_text: string | null }>();
    (attempts || []).forEach((a) => {
      if (!latest.has(a.question_id)) latest.set(a.question_id, a);
    });
    if (latest.size === 0) {
      await admin.from('quiz_auto_reviews').delete().eq('quiz_id', quizId).eq('user_id', userId);
      return { ok: false, error: '回答がありません' };
    }

    // 設問ごとの添削対象（選んだ回答文）と正答の要旨
    const targets = (questions || [])
      .filter((q) => latest.has(q.id))
      .map((q) => {
        const choices: string[] = Array.isArray(q.choices) ? (q.choices as string[]) : [];
        const a = latest.get(q.id)!;
        const sel = a.selected_index;
        const text = a.answer_text || (sel !== null && sel !== undefined ? choices[sel] ?? '' : '');
        const hasCorrect = q.correct_index !== null && q.correct_index !== undefined;
        return {
          q,
          text,
          correctText: hasCorrect ? choices[q.correct_index as number] ?? '' : '',
          knownCorrect: hasCorrect && sel !== null && sel !== undefined ? sel === q.correct_index : null,
        };
      });

    const reviews: AutoQuestionReview[] = await mapWithConcurrency(targets, 4, async (t) => {
      const d = await draftRedPen({
        courseTitle: course?.title || '',
        quizTitle: quiz.title,
        questionText: t.q.question_text,
        answerText: t.text,
        correctText: t.correctText,
        explanation: t.q.explanation,
        knownCorrect: t.knownCorrect,
        autoFeedback: true,
      });
      return { question_id: t.q.id, answer_text: t.text, comment: d.summary || null, markup: d.markup };
    });

    if (reviews.every((r) => !r.markup && !r.comment)) {
      await markFailed(admin, quizId, userId, 'AI の添削を作成できませんでした');
      return { ok: false, error: 'AI の添削を作成できませんでした' };
    }

    // 全体のコメント（設問が1問なら、その設問のコメントで足りるので作らない）
    let overall: string | null = null;
    if (reviews.length > 1) {
      try {
        const summaryLines = targets
          .map((t, i) => `問${i + 1}. ${t.q.question_text}\n回答: ${t.text}\n講評: ${reviews[i].comment || ''}`)
          .join('\n\n');
        const out = await geminiGenerateJSON(
          `あなたは企業研修の講師です。受講者が小テストに回答しました。設問ごとの講評をもとに、全体へのコメントを書いてください。

コース名: ${course?.title || ''}
テスト名: ${quiz.title}

${summaryLines}

ルール:
- 80〜160字。良かった点と、次に意識するとよい点を具体的に、前向きな言葉で伝える。
- 「正解」「不正解」という判定の言葉、点数、署名、講師名は書かない。

次のJSONのみを出力してください: {"comment":"..."}`,
          { purpose: 'review' }
        );
        overall = typeof out?.comment === 'string' && out.comment.trim() ? out.comment.trim() : null;
      } catch (e) {
        console.error('[autoReview] overall comment error:', e);
      }
    }

    const now = new Date().toISOString();
    const { error: saveErr } = await admin.from('quiz_auto_reviews').upsert(
      {
        quiz_id: quizId,
        user_id: userId,
        status: 'ready',
        question_reviews: reviews,
        review_comment: overall,
        ai_question_reviews: reviews,
        ai_review_comment: overall,
        model: geminiModelName('review'),
        ai_instructor_id: instructor?.id ?? null,
        ai_instructor_name: instructor?.name ?? null,
        error: null,
        generated_at: now,
        edited_at: null,
        confirmed_by: null,
        confirmed_at: null,
        updated_at: now,
      },
      { onConflict: 'quiz_id,user_id' }
    );
    if (saveErr) throw new Error(saveErr.message);
    return { ok: true };
  } catch (e) {
    console.error('[autoReview] generate error:', e);
    await markFailed(admin, quizId, userId, String(e instanceof Error ? e.message : e));
    return { ok: false, error: '自動添削の作成に失敗しました' };
  }
}

/** 講師名（確認した講師）をまとめて引く */
export async function reviewerNames(admin: SupabaseClient, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await admin.from('user_profiles').select('id, display_name, email').in('id', unique);
  (data || []).forEach((u) => map.set(u.id, u.display_name || u.email || ''));
  return map;
}

/** DB の行 → 受講者・アプリに返す形 */
export function toAutoReviewView(row: any, names: Map<string, string>): AutoReviewView {
  const confirmed = !!row.confirmed_at && !!row.confirmed_by;
  return {
    status: effectiveStatus(row),
    comment: row.review_comment ?? null,
    question_reviews: (Array.isArray(row.question_reviews) ? row.question_reviews : []).map((r: any) => ({
      question_id: Number(r.question_id),
      comment: r.comment ?? null,
      markup: Array.isArray(r.markup) ? r.markup : null,
    })),
    generated_at: row.generated_at ?? null,
    instructor_name: row.ai_instructor_name ?? null,
    signature: aiInstructorLabel(row.ai_instructor_name),
    confirmed,
    reviewer_name: confirmed ? names.get(row.confirmed_by) || null : null,
    confirmed_at: confirmed ? row.confirmed_at : null,
  };
}

/** 受講者1人・テスト1件の自動添削を読む */
export async function loadAutoReviewView(
  admin: SupabaseClient,
  quizId: number,
  userId: string
): Promise<AutoReviewView | null> {
  const { data: row } = await admin
    .from('quiz_auto_reviews')
    .select('*')
    .eq('quiz_id', quizId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!row) return null;
  const names = await reviewerNames(admin, [row.confirmed_by]);
  return toAutoReviewView(row, names);
}

/**
 * 講師が編集した設問ごとの添削を検証して保存用の形にする
 * （赤ペンは元の回答文と一致しないものは捨てる）
 */
export function sanitizeEditedReviews(current: AutoQuestionReview[], edited: unknown): AutoQuestionReview[] {
  const byId = new Map(current.map((r) => [Number(r.question_id), r]));
  const list = Array.isArray(edited) ? edited : [];
  const result: AutoQuestionReview[] = [];
  for (const base of current) {
    const e = list.find((x: any) => Number(x?.question_id) === Number(base.question_id)) as any;
    if (!e) {
      result.push(base);
      continue;
    }
    const original = byId.get(Number(base.question_id))?.answer_text || '';
    result.push({
      question_id: base.question_id,
      answer_text: base.answer_text,
      comment: typeof e.comment === 'string' ? e.comment : base.comment,
      markup: e.markup === null ? null : e.markup ? normalizeMarkup(original, e.markup) ?? base.markup : base.markup,
    });
  }
  return result;
}
