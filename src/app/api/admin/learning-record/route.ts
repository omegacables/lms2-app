import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { computeGateState } from '@/lib/quiz/gating';
import { aiInstructorLabel, isAutoOrigin, reviewSignature } from '@/lib/quiz/aiInstructors';

export const runtime = 'nodejs';

// GET /api/admin/learning-record?userId=&courseId=
// 実施記録PDF用に、1受講者×1コースの学習・テスト記録を集約して返す。
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor', 'labor_consultant']);
  if (!auth.ok) return auth.response;

  const userId = request.nextUrl.searchParams.get('userId');
  const courseIdRaw = request.nextUrl.searchParams.get('courseId');
  if (!userId || !courseIdRaw) {
    return NextResponse.json({ error: 'userId と courseId が必要です' }, { status: 400 });
  }
  const courseId = Number(courseIdRaw);
  const admin = createAdminSupabaseClient();

  // 受講者
  const { data: student } = await admin
    .from('user_profiles')
    .select('display_name, email, company, department')
    .eq('id', userId)
    .single();

  // コース
  const { data: course } = await admin
    .from('courses')
    .select('id, title, standard_learning_minutes, standard_learning_period, training_type_note, test_required, completion_threshold')
    .eq('id', courseId)
    .single();
  if (!course) return NextResponse.json({ error: 'コースが見つかりません' }, { status: 404 });

  // 受講期間
  const { data: uc } = await admin
    .from('user_courses')
    .select('assigned_at')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();

  // 証明書
  const { data: cert } = await admin
    .from('certificates')
    .select('id, completion_date')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();

  // 動画と視聴ログ
  const { data: videos } = await admin
    .from('videos')
    .select('id, title, order_index, duration, file_url, status')
    .eq('course_id', courseId)
    .eq('status', 'active')
    .not('file_url', 'is', null)
    .order('order_index', { ascending: true });

  const { data: logs } = await admin
    .from('video_view_logs')
    .select('video_id, start_time, end_time, completed_at, last_updated, total_watched_time, progress_percent, status')
    .eq('user_id', userId)
    .eq('course_id', courseId);

  const videoRecords = (videos || []).filter((v) => v.file_url).map((v) => {
    const vlogs = (logs || []).filter((l) => l.video_id === v.id);
    let firstStart: string | null = null;
    let lastEnd: string | null = null;
    let watched = 0;
    let progress = 0;
    let completedAt: string | null = null;
    for (const l of vlogs) {
      if (l.start_time && (!firstStart || new Date(l.start_time) < new Date(firstStart))) firstStart = l.start_time;
      const endCand = l.completed_at || l.end_time || l.last_updated;
      if (endCand && (!lastEnd || new Date(endCand) > new Date(lastEnd))) lastEnd = endCand;
      watched = Math.max(watched, l.total_watched_time || 0);
      progress = Math.max(progress, l.progress_percent || 0);
      if (l.status === 'completed' && l.completed_at) {
        if (!completedAt || new Date(l.completed_at) > new Date(completedAt)) completedAt = l.completed_at;
      }
    }
    return {
      title: v.title,
      duration: v.duration,
      first_start: firstStart,
      last_end: lastEnd,
      watched_seconds: watched,
      progress_percent: progress,
      completed_at: completedAt,
    };
  });

  // クイズ
  const { data: quizzes } = await admin
    .from('quizzes')
    .select('id, title, quiz_type, grading_mode, after_video_id, sort_order, status')
    .eq('course_id', courseId)
    .eq('status', 'published')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  const choiceQuizzes: any[] = [];
  const essayQuizzes: any[] = [];

  for (const quiz of quizzes || []) {
    const { data: questions } = await admin
      .from('quiz_questions')
      .select('id, question_text, choices, correct_index, explanation, sort_order')
      .eq('quiz_id', quiz.id)
      .order('sort_order', { ascending: true });
    const { data: attempts } = await admin
      .from('quiz_attempts')
      .select('question_id, selected_index, answer_text, is_correct, attempt_no, answered_at')
      .eq('quiz_id', quiz.id)
      .eq('user_id', userId)
      .order('attempt_no', { ascending: true });

    // 提出制（記述式／選択式 grading_mode='review'）は添削記録として出力する
    const isReviewQuiz = quiz.quiz_type === 'essay' || quiz.grading_mode === 'review';

    if (!isReviewQuiz) {
      // 小テストの自動添削（AI）
      const { data: autoRow } = await admin
        .from('quiz_auto_reviews')
        .select('*')
        .eq('quiz_id', quiz.id)
        .eq('user_id', userId)
        .maybeSingle();
      const autoReady = autoRow && autoRow.status === 'ready';
      let autoReviewer: string | null = null;
      if (autoReady && autoRow.confirmed_by) {
        const { data: rp } = await admin.from('user_profiles').select('display_name, email').eq('id', autoRow.confirmed_by).single();
        autoReviewer = rp?.display_name || rp?.email || null;
      }
      const autoMarks: any[] = autoReady && Array.isArray(autoRow.question_reviews) ? autoRow.question_reviews : [];

      choiceQuizzes.push({
        title: quiz.title,
        auto_review: autoReady
          ? {
              comment: autoRow.review_comment ?? null,
              signature: aiInstructorLabel(autoRow.ai_instructor_name),
              generated_at: autoRow.generated_at,
              confirmed: !!autoRow.confirmed_at,
              reviewer_name: autoReviewer,
              confirmed_at: autoRow.confirmed_at,
              edited: !!autoRow.edited_at,
            }
          : null,
        questions: (questions || []).map((q) => {
          const choices: string[] = Array.isArray(q.choices) ? (q.choices as string[]) : [];
          const qAttempts = (attempts || []).filter((a) => a.question_id === q.id);
          const mark = autoMarks.find((m) => Number(m.question_id) === q.id);
          return {
            question_text: q.question_text,
            choices,
            explanation: q.explanation || '',
            auto_mark: mark ? { comment: mark.comment ?? null, markup: Array.isArray(mark.markup) ? mark.markup : null } : null,
            attempts: qAttempts.map((a) => ({
              attempt_no: a.attempt_no,
              selected_index: a.selected_index,
              // 回答文生成の場合は選んだ文章（answer_text）、固定選択肢は選択肢の文言
              selected_text:
                a.answer_text ||
                (a.selected_index !== null && a.selected_index !== undefined ? choices[a.selected_index] ?? '' : ''),
              is_correct: a.is_correct,
              answered_at: a.answered_at,
            })),
          };
        }),
      });
    } else {
      const { data: reviews } = await admin
        .from('essay_reviews')
        .select('result, review_comment, explanation, question_reviews, reviewer_id, reviewed_at, auto_reviewed, ai_instructor_name')
        .eq('quiz_id', quiz.id)
        .eq('user_id', userId)
        .order('reviewed_at', { ascending: true });
      // 添削者名
      const reviewerIds = Array.from(new Set((reviews || []).map((r) => r.reviewer_id).filter(Boolean)));
      const reviewerMap = new Map<string, string>();
      if (reviewerIds.length > 0) {
        const { data: reviewers } = await admin
          .from('user_profiles')
          .select('id, display_name, email')
          .in('id', reviewerIds as string[]);
        (reviewers || []).forEach((r) => reviewerMap.set(r.id, r.display_name || r.email || r.id));
      }
      // 最新添削の設問ごとの正誤・コメント
      const latestReview = reviews && reviews.length > 0 ? reviews[reviews.length - 1] : null;
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

      essayQuizzes.push({
        title: quiz.title,
        type_label: quiz.quiz_type === 'choice' ? '最終テスト（選択式）' : '記述式最終テスト',
        questions: (questions || []).map((q) => {
          const qAttempts = (attempts || []).filter((a) => a.question_id === q.id);
          const choices: string[] = Array.isArray(q.choices) ? (q.choices as string[]) : [];
          const mark = questionReviewMap.get(q.id) || null;
          return {
            question_text: q.question_text,
            answers: qAttempts.map((a) => ({
              attempt_no: a.attempt_no,
              // 選択式は「選んだ回答文」を記録する（回答文生成なら生成された文章、固定選択肢なら番号と文言）
              answer_text:
                quiz.quiz_type === 'choice'
                  ? a.answer_text ||
                    (a.selected_index !== null && a.selected_index !== undefined
                      ? `${a.selected_index + 1}. ${choices[a.selected_index] ?? ''}`
                      : '（未回答）')
                  : a.answer_text,
              answered_at: a.answered_at,
            })),
            review_mark: mark,
          };
        }),
        // 赤ペンの署名「講師　名前」（自動添削は担当講師の名前、講師が自分で添削したものは講師本人の名前）
        signer_label: latestReview
          ? reviewSignature(latestReview, latestReview.reviewer_id ? reviewerMap.get(latestReview.reviewer_id) || null : null) || ''
          : '',
        reviews: (reviews || []).map((r) => {
          const humanName = r.reviewer_id ? reviewerMap.get(r.reviewer_id) || '' : '';
          const auto = isAutoOrigin(r);
          return {
            result: r.result,
            comment: r.review_comment,
            explanation: r.explanation || '',
            // 自動添削は「講師　担当講師の名前」（PDF に「AIによる自動添削」と記載）。講師が確認して返却し直したものは確認した講師も載せる
            reviewer_name: auto ? aiInstructorLabel(r.ai_instructor_name) : humanName,
            auto,
            confirmed_by: auto && !r.auto_reviewed ? humanName : '',
            reviewed_at: r.reviewed_at,
          };
        }),
      });
    }
  }

  const gate = await computeGateState(admin, userId, courseId);

  // 添削印鑑・署名（証明書設定を流用）
  const { data: settingRows } = await admin
    .from('system_settings')
    .select('setting_key, setting_value')
    .in('setting_key', ['certificate.company_name', 'certificate.signer_name', 'certificate.signer_title', 'certificate.stamp_image_url']);
  const settingMap = new Map((settingRows || []).map((s) => [s.setting_key, s.setting_value]));

  return NextResponse.json({
    seal: {
      stampUrl: settingMap.get('certificate.stamp_image_url') || null,
      signerName: settingMap.get('certificate.signer_name') || '',
      signerTitle: settingMap.get('certificate.signer_title') || '',
      companyName: settingMap.get('certificate.company_name') || '',
    },
    student: {
      name: student?.display_name || student?.email || userId,
      email: student?.email || '',
      company: student?.company || '',
      department: student?.department || '',
    },
    course: {
      title: course.title,
      standard_learning_minutes: course.standard_learning_minutes,
      standard_learning_period: course.standard_learning_period,
      training_type_note: course.training_type_note,
      test_required: course.test_required,
    },
    period: {
      assigned_at: uc?.assigned_at || null,
      completion_date: cert?.completion_date || null,
    },
    certificate: cert ? { id: cert.id, completion_date: cert.completion_date } : null,
    videos: videoRecords,
    choiceQuizzes,
    essayQuizzes,
    testsPassed: course.test_required ? gate.allPassed : null,
    totalWatchedSeconds: videoRecords.reduce((s, v) => s + (v.watched_seconds || 0), 0),
  });
}
