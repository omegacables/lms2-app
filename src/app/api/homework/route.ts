import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/getUser';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { computeGateState } from '@/lib/quiz/gating';

export const runtime = 'nodejs';

type HomeworkStatus = 'locked' | 'not_submitted' | 'under_review' | 'needs_revision' | 'passed';

// GET /api/homework
// 受講者の課題ページ用データ。
//  items       … 提出制テスト（記述式／選択式 grading_mode='review'）の提出内容と添削結果
//  quizResults … 即時採点の小テスト（grading_mode='auto'）の結果
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
    // --- 即時採点の小テストの結果：問題・選択した回答・正誤・解説 ---
    const { data: choiceQuizzes } = await admin
      .from('quizzes')
      .select('id, title, quiz_type, grading_mode, status')
      .eq('course_id', course.id)
      .eq('quiz_type', 'choice')
      .eq('grading_mode', 'auto')
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
        .select('question_id, selected_index, answer_text, is_correct, answered_at')
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
            selected_text:
              a?.answer_text ||
              (a && a.selected_index !== null && a.selected_index !== undefined ? choices[a.selected_index] ?? '' : ''),
            is_correct: a?.is_correct ?? null,
            explanation: q.explanation || '',
            answered_at: a?.answered_at ?? null,
          };
        }),
      });
    }

    // --- 提出制テスト（記述式／選択式 grading_mode='review'）---
    const { data: reviewQuizzes } = await admin
      .from('quizzes')
      .select('id, title, quiz_type, grading_mode, answer_style, status')
      .eq('course_id', course.id)
      .eq('status', 'published')
      .or('quiz_type.eq.essay,grading_mode.eq.review')
      .order('sort_order', { ascending: true });
    if (!reviewQuizzes || reviewQuizzes.length === 0) continue;

    const gate = await computeGateState(admin, user.id, course.id);

    for (const quiz of reviewQuizzes) {
      const isChoice = quiz.quiz_type === 'choice';

      // 設問
      const { data: questions } = await admin
        .from('quiz_questions')
        .select('id, question_text, choices, explanation, sort_order')
        .eq('quiz_id', quiz.id)
        .order('sort_order', { ascending: true });

      // 最新提出（設問ごと）
      const { data: attempts } = await admin
        .from('quiz_attempts')
        .select('question_id, answer_text, selected_index, attempt_no, answered_at')
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
        .select('result, review_comment, explanation, question_reviews, reviewed_at, reviewer_id')
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
      // 設問ごとの添削（正誤・コメント）
      const questionReviewMap = new Map<number, { is_correct: boolean | null; comment: string | null; markup: any[] | null }>();
      if (latestReview && Array.isArray(latestReview.question_reviews)) {
        (latestReview.question_reviews as any[]).forEach((r) => {
          if (r && r.question_id !== undefined) {
            questionReviewMap.set(Number(r.question_id), {
              is_correct: typeof r.is_correct === 'boolean' ? r.is_correct : null,
              comment: r.comment ?? null,
              markup: Array.isArray(r.markup) ? r.markup : null,
            });
          }
        });
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
        quiz_type: quiz.quiz_type,
        grading_mode: quiz.grading_mode,
        answer_style: quiz.answer_style,
        status,
        lock_reason: gate.quizUnlocked[quiz.id]?.reason || null,
        questions: (questions || []).map((q) => {
          const choices: string[] = Array.isArray(q.choices) ? (q.choices as string[]) : [];
          const a = latestAnswer.get(q.id);
          const selectedIndex = a?.selected_index ?? null;
          const qr = questionReviewMap.get(q.id) || null;
          return {
            id: q.id,
            question_text: q.question_text,
            my_answer: a?.answer_text ?? '',
            answered_at: a?.answered_at ?? null,
            // 選択式（提出→添削）用。回答文生成では回答パターンそのものは見せない（選んだ文章だけを表示）
            choices: isChoice && quiz.answer_style !== 'generated' ? choices : [],
            selected_index: selectedIndex,
            // 選んだ回答文（回答文生成なら生成された文章）
            selected_text: isChoice
              ? a?.answer_text ||
                (selectedIndex !== null && selectedIndex !== undefined ? choices[selectedIndex] ?? '' : '')
              : '',
            // 指導者が付けた正誤・個別コメント・赤ペン
            review_is_correct: qr?.is_correct ?? null,
            review_comment: qr?.comment ?? null,
            review_markup: qr?.markup ?? null,
          };
        }),
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
