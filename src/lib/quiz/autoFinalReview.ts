// 最終テスト（提出制: 記述式／選択式 grading_mode='review'）の自動添削。サーバー専用。
//
// 受講者が提出すると、AI が赤ペン・講評・全体コメント・解説と合否（合格／要再提出）を作成し、
// 添削（essay_reviews）として自動で返却する。署名は「講師　{担当講師の名前}」（auto_reviewed=true、reviewer_id は持たない）。
// 合格なら修了要件を満たしていれば修了証を発行する（講師が返却した場合と同じ）。
// 作成に失敗したときは添削待ちのまま残り、講師が添削画面から返却できる。

import type { SupabaseClient } from '@supabase/supabase-js';
import { isGeminiConfigured } from '@/lib/ai/gemini';
import { issueCertificateIfEligible } from '@/lib/certificate/issue';
import { notifyUsers } from '@/lib/notify';
import { draftSubmissionReview } from '@/lib/quiz/reviewDraft';
import { aiInstructorLabel, resolveCourseAiInstructor } from '@/lib/quiz/aiInstructors';

/** 最新の提出がまだ添削されていないか（添削済みなら二重に返却しない） */
async function awaitingReview(admin: SupabaseClient, quizId: number, userId: string): Promise<boolean> {
  const [{ data: lastAttempt }, { data: lastReview }] = await Promise.all([
    admin
      .from('quiz_attempts')
      .select('answered_at')
      .eq('quiz_id', quizId)
      .eq('user_id', userId)
      .order('answered_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('essay_reviews')
      .select('reviewed_at')
      .eq('quiz_id', quizId)
      .eq('user_id', userId)
      .order('reviewed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!lastAttempt) return false;
  if (!lastReview) return true;
  return new Date(lastReview.reviewed_at).getTime() < new Date(lastAttempt.answered_at).getTime();
}

export async function generateFinalAutoReview(
  admin: SupabaseClient,
  quizId: number,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!isGeminiConfigured()) return { ok: false, error: 'AI が未設定です（GEMINI_API_KEY）' };

    const { data: quiz } = await admin
      .from('quizzes')
      .select('id, course_id, title, quiz_type, grading_mode')
      .eq('id', quizId)
      .single();
    if (!quiz || (quiz.quiz_type !== 'essay' && quiz.grading_mode !== 'review')) {
      return { ok: false, error: '提出制のテストではありません' };
    }
    if (!(await awaitingReview(admin, quizId, userId))) return { ok: false, error: '添削待ちの提出がありません' };

    const [instructor, draft] = await Promise.all([
      resolveCourseAiInstructor(admin, quiz.course_id),
      draftSubmissionReview(admin, quizId, userId),
    ]);

    // AI の作成中に講師が返却していた場合は二重に返却しない
    if (!(await awaitingReview(admin, quizId, userId))) return { ok: false, error: 'すでに添削済みです' };

    const { error: insErr } = await admin.from('essay_reviews').insert({
      quiz_id: quizId,
      user_id: userId,
      reviewer_id: null,
      auto_reviewed: true,
      ai_instructor_id: instructor?.id ?? null,
      ai_instructor_name: instructor?.name ?? null,
      review_comment: draft.comment || null,
      explanation: draft.explanation || null,
      question_reviews: draft.question_reviews,
      result: draft.result,
      ai_assisted: true,
      reviewed_at: new Date().toISOString(),
    });
    if (insErr) throw new Error(insErr.message);

    const signature = aiInstructorLabel(instructor?.name);
    await notifyUsers(admin, [userId], {
      title: draft.result === 'passed' ? 'テストに合格しました' : 'テストの再提出のお願い',
      message:
        draft.result === 'passed'
          ? `「${quiz.title}」の添削（${signature}）が返却され、合格となりました。課題ページで確認できます。`
          : `「${quiz.title}」の添削（${signature}）が返却されました。課題ページでコメントを確認して再提出してください。`,
      type: 'essay_review',
      related_type: 'quiz',
      related_id: quizId,
    });

    if (draft.result === 'passed') {
      const cert = await issueCertificateIfEligible(admin, userId, quiz.course_id);
      if (cert.ok && cert.created) {
        await notifyUsers(admin, [userId], {
          title: '修了証が発行されました',
          message: 'コースを修了しました。修了証ページからダウンロードできます。',
          type: 'certificate',
          related_type: 'course',
          related_id: quiz.course_id,
        });
      }
    }
    return { ok: true };
  } catch (e) {
    console.error('[autoFinalReview] error:', e);
    return { ok: false, error: String(e instanceof Error ? e.message : e) };
  }
}
