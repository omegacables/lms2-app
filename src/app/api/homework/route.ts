import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/getUser';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { computeGateState } from '@/lib/quiz/gating';

export const runtime = 'nodejs';

type HomeworkStatus = 'locked' | 'not_submitted' | 'under_review' | 'needs_revision' | 'passed';

// GET /api/homework
// 受講者の記述式最終テスト（通信制コースのみ）を状態付きで返す。
export async function GET(request: NextRequest) {
  const { user, response } = await getAuthUser(request);
  if (!user) return response!;

  const admin = createAdminSupabaseClient();

  // 添削の印鑑・署名設定（証明書設定を流用）
  const { data: settingRows } = await admin
    .from('system_settings')
    .select('setting_key, setting_value')
    .in('setting_key', ['certificate.company_name', 'certificate.signer_name', 'certificate.signer_title', 'certificate.stamp_image_url']);
  const settingMap = new Map((settingRows || []).map((s) => [s.setting_key, s.setting_value]));
  const stampUrl = settingMap.get('certificate.stamp_image_url') || null;

  // 受講中コース
  const { data: userCourses } = await admin
    .from('user_courses')
    .select('course_id')
    .eq('user_id', user.id);
  const courseIds = (userCourses || []).map((uc) => uc.course_id);
  if (courseIds.length === 0) return NextResponse.json({ items: [], quizResults: [], stampUrl });

  // 通信制コース（test_required=true）
  const { data: courses } = await admin
    .from('courses')
    .select('id, title, test_required')
    .in('id', courseIds)
    .eq('test_required', true);
  const targetCourses = courses || [];

  const items: any[] = [];
  const quizResults: any[] = [];

  for (const course of targetCourses) {
    // --- 小テスト（選択式）の結果：問題・選択した回答・正誤・解説 ---
    const { data: choiceQuizzes } = await admin
      .from('quizzes')
      .select('id, title, quiz_type, status')
      .eq('course_id', course.id)
      .eq('quiz_type', 'choice')
      .eq('status', 'published')
      .order('sort_order', { ascending: true });

    for (const cq of choiceQuizzes || []) {
      const { data: cqQuestions } = await admin
        .from('quiz_questions')
        .select('id, question_text, choices, correct_index, explanation, sort_order')
        .eq('quiz_id', cq.id)
        .order('sort_order', { ascending: true });

      const { data: cqAttempts } = await admin
        .from('quiz_attempts')
        .select('question_id, selected_index, is_correct, answered_at')
        .eq('quiz_id', cq.id)
        .eq('user_id', user.id)
        .order('answered_at', { ascending: false });
      if (!cqAttempts || cqAttempts.length === 0) continue; // 未受験の小テストは表示しない

      const latest = new Map<number, any>();
      cqAttempts.forEach((a) => { if (!latest.has(a.question_id)) latest.set(a.question_id, a); });

      quizResults.push({
        quiz_id: cq.id,
        course_id: course.id,
        course_title: course.title,
        title: cq.title,
        questions: (cqQuestions || []).map((q) => {
          const choices: string[] = Array.isArray(q.choices) ? (q.choices as string[]) : [];
          const a = latest.get(q.id);
          return {
            question_text: q.question_text,
            choices,
            selected_index: a?.selected_index ?? null,
            selected_text: a && a.selected_index !== null && a.selected_index !== undefined ? choices[a.selected_index] ?? '' : '',
            is_correct: a?.is_correct ?? null,
            explanation: q.explanation || '',
            answered_at: a?.answered_at ?? null,
          };
        }),
      });
    }

    // 記述式クイズ
    const { data: essays } = await admin
      .from('quizzes')
      .select('id, title, quiz_type, status')
      .eq('course_id', course.id)
      .eq('quiz_type', 'essay')
      .eq('status', 'published');
    if (!essays || essays.length === 0) continue;

    const gate = await computeGateState(admin, user.id, course.id);

    for (const quiz of essays) {
      // 設問
      const { data: questions } = await admin
        .from('quiz_questions')
        .select('id, question_text, sort_order')
        .eq('quiz_id', quiz.id)
        .order('sort_order', { ascending: true });

      // 最新提出（設問ごと）
      const { data: attempts } = await admin
        .from('quiz_attempts')
        .select('question_id, answer_text, attempt_no, answered_at')
        .eq('quiz_id', quiz.id)
        .eq('user_id', user.id)
        .order('answered_at', { ascending: false });
      const latestAnswer = new Map<number, any>();
      (attempts || []).forEach((a) => {
        if (!latestAnswer.has(a.question_id)) latestAnswer.set(a.question_id, a);
      });

      // 最新添削
      const { data: reviews } = await admin
        .from('essay_reviews')
        .select('result, review_comment, explanation, reviewed_at, reviewer_id')
        .eq('quiz_id', quiz.id)
        .eq('user_id', user.id)
        .order('reviewed_at', { ascending: false });
      const latestReview = reviews && reviews.length > 0 ? reviews[0] : null;
      let reviewerName: string | null = null;
      if (latestReview?.reviewer_id) {
        const { data: rp } = await admin
          .from('user_profiles')
          .select('display_name, email')
          .eq('id', latestReview.reviewer_id)
          .single();
        reviewerName = rp?.display_name || rp?.email || null;
      }

      const unlocked = gate.quizUnlocked[quiz.id]?.unlocked ?? false;
      const hasSubmission = (attempts || []).length > 0;
      let status: HomeworkStatus;
      if (!unlocked) status = 'locked';
      else if (!hasSubmission) status = 'not_submitted';
      else if (!latestReview) status = 'under_review';
      else if (latestReview.result === 'needs_revision') status = 'needs_revision';
      else status = 'passed';

      items.push({
        quiz_id: quiz.id,
        course_id: course.id,
        course_title: course.title,
        title: quiz.title,
        status,
        lock_reason: gate.quizUnlocked[quiz.id]?.reason || null,
        questions: (questions || []).map((q) => ({
          id: q.id,
          question_text: q.question_text,
          my_answer: latestAnswer.get(q.id)?.answer_text ?? '',
          answered_at: latestAnswer.get(q.id)?.answered_at ?? null,
        })),
        review: latestReview
          ? {
              result: latestReview.result,
              comment: latestReview.review_comment,
              explanation: latestReview.explanation || null,
              reviewed_at: latestReview.reviewed_at,
              reviewer_name: reviewerName,
            }
          : null,
        // 再提出可能か（未提出 or 要再提出）
        can_submit: unlocked && (status === 'not_submitted' || status === 'needs_revision'),
      });
    }
  }

  return NextResponse.json({ items, quizResults, stampUrl });
}
