import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { chunk, consultantCompanyScope, inScope } from '@/lib/auth/consultantScope';
import { effectiveStatus } from '@/lib/quiz/autoReview';

export const runtime = 'nodejs';

// GET /api/admin/test-results?courseId=
// コースの小テスト・最終テストについて、受講者ごとの回答・添削の状況を返す（閲覧用）。
// 社労士は担当会社の受講者だけ。設問・回答・添削の中身は /api/admin/learning-record で受講者ごとに取る。
//
// 返す形:
//   quizzes: [{ id, title, kind: 'small' | 'final', video_title }]
//   rows:    [{ user_id, name, company, department, results: { [quizId]: Result } }]
//   Result（小テスト）: { status: 'none' | 'partial' | 'answered', answered, total, at, review: 'pending' | 'ready' | 'failed' | null, confirmed }
//   Result（最終テスト）: { status: 'not_submitted' | 'under_review' | 'passed' | 'needs_revision', at, auto, confirmed }

const PAGE = 1000;

/** 1000件ずつ全件を取る（PostgREST は1回に最大1000件しか返さない） */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor', 'labor_consultant']);
  if (!auth.ok) return auth.response;

  const courseId = Number(request.nextUrl.searchParams.get('courseId'));
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: 'courseId が必要です' }, { status: 400 });
  }
  const admin = createAdminSupabaseClient();

  try {
    const { data: course } = await admin.from('courses').select('id, title').eq('id', courseId).maybeSingle();
    if (!course) return NextResponse.json({ error: 'コースが見つかりません' }, { status: 404 });

    // テスト（公開中）。小テストは配置された動画の順、最終テスト（動画に紐づかない）は最後
    const { data: quizRows } = await admin
      .from('quizzes')
      .select('id, title, quiz_type, grading_mode, after_video_id, sort_order')
      .eq('course_id', courseId)
      .eq('status', 'published');
    const { data: videos } = await admin.from('videos').select('id, title, order_index').eq('course_id', courseId);
    const videoMap = new Map((videos || []).map((v) => [v.id, v]));
    const quizzes = (quizRows || [])
      .map((q) => {
        const final = q.quiz_type === 'essay' || q.grading_mode === 'review';
        const video = q.after_video_id ? videoMap.get(q.after_video_id) : undefined;
        return {
          id: q.id as number,
          title: q.title as string,
          kind: (final ? 'final' : 'small') as 'small' | 'final',
          video_title: video?.title ?? null,
          order: video ? video.order_index ?? 0 : Number.MAX_SAFE_INTEGER,
          sort_order: q.sort_order ?? 0,
        };
      })
      .sort((a, b) => a.order - b.order || a.sort_order - b.sort_order || a.id - b.id);
    const quizIds = quizzes.map((q) => q.id);

    // 受講者（社労士は担当会社のみ）
    const enrollments = await fetchAll<{ user_id: string }>((from, to) =>
      admin.from('user_courses').select('user_id').eq('course_id', courseId).order('user_id').range(from, to)
    );
    const enrolledIds = Array.from(new Set(enrollments.map((e) => e.user_id)));
    const profiles: { id: string; display_name: string | null; email: string | null; company: string | null; department: string | null }[] = [];
    for (const ids of chunk(enrolledIds)) {
      const { data } = await admin.from('user_profiles').select('id, display_name, email, company, department').in('id', ids);
      profiles.push(...(data || []));
    }
    const scope = await consultantCompanyScope(admin, auth);
    const students = profiles.filter((p) => inScope(scope, p.company));
    const visible = new Set(students.map((s) => s.id));

    if (quizIds.length === 0 || students.length === 0) {
      return NextResponse.json({
        course,
        quizzes: quizzes.map(({ id, title, kind, video_title }) => ({ id, title, kind, video_title })),
        rows: students
          .map((s) => ({ user_id: s.id, name: s.display_name || s.email || s.id, company: s.company || '', department: s.department || '', results: {} }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ja')),
      });
    }

    // 設問数（小テストは全問に回答したら「回答済み」）
    const questions = await fetchAll<{ id: number; quiz_id: number }>((from, to) =>
      admin.from('quiz_questions').select('id, quiz_id').in('quiz_id', quizIds).order('id').range(from, to)
    );
    const questionsByQuiz = new Map<number, Set<number>>();
    questions.forEach((q) => {
      if (!questionsByQuiz.has(q.quiz_id)) questionsByQuiz.set(q.quiz_id, new Set());
      questionsByQuiz.get(q.quiz_id)!.add(q.id);
    });

    const attempts = (
      await fetchAll<{ quiz_id: number; user_id: string; question_id: number; answered_at: string }>((from, to) =>
        admin.from('quiz_attempts').select('quiz_id, user_id, question_id, answered_at').in('quiz_id', quizIds).order('id').range(from, to)
      )
    ).filter((a) => visible.has(a.user_id));

    const finalIds = quizzes.filter((q) => q.kind === 'final').map((q) => q.id);
    const smallIds = quizzes.filter((q) => q.kind === 'small').map((q) => q.id);

    const reviews = finalIds.length
      ? (
          await fetchAll<{ quiz_id: number; user_id: string; result: string; reviewed_at: string; auto_reviewed: boolean | null; ai_instructor_name: string | null }>((from, to) =>
            admin
              .from('essay_reviews')
              .select('quiz_id, user_id, result, reviewed_at, auto_reviewed, ai_instructor_name')
              .in('quiz_id', finalIds)
              .order('id')
              .range(from, to)
          )
        ).filter((r) => visible.has(r.user_id))
      : [];

    const autoReviews = smallIds.length
      ? (
          await fetchAll<{ quiz_id: number; user_id: string; status: string; updated_at: string; confirmed_at: string | null }>((from, to) =>
            admin
              .from('quiz_auto_reviews')
              .select('quiz_id, user_id, status, updated_at, confirmed_at')
              .in('quiz_id', smallIds)
              .order('id')
              .range(from, to)
          )
        ).filter((r) => visible.has(r.user_id))
      : [];

    // 受講者×テストごとにまとめる
    const key = (quizId: number, userId: string) => `${quizId}:${userId}`;
    const answered = new Map<string, Set<number>>();
    const lastAnswer = new Map<string, string>();
    for (const a of attempts) {
      const k = key(a.quiz_id, a.user_id);
      if (questionsByQuiz.get(a.quiz_id)?.has(a.question_id)) {
        if (!answered.has(k)) answered.set(k, new Set());
        answered.get(k)!.add(a.question_id);
      }
      if (!lastAnswer.has(k) || new Date(a.answered_at) > new Date(lastAnswer.get(k)!)) lastAnswer.set(k, a.answered_at);
    }
    const latestReview = new Map<string, (typeof reviews)[number]>();
    for (const r of reviews) {
      const k = key(r.quiz_id, r.user_id);
      const cur = latestReview.get(k);
      if (!cur || new Date(r.reviewed_at) > new Date(cur.reviewed_at)) latestReview.set(k, r);
    }
    const autoMap = new Map(autoReviews.map((r) => [key(r.quiz_id, r.user_id), r]));

    const rows = students
      .map((s) => {
        const results: Record<number, unknown> = {};
        for (const q of quizzes) {
          const k = key(q.id, s.id);
          const at = lastAnswer.get(k) || null;
          if (q.kind === 'small') {
            const total = questionsByQuiz.get(q.id)?.size || 0;
            const count = answered.get(k)?.size || 0;
            const auto = autoMap.get(k);
            results[q.id] = {
              status: count === 0 ? 'none' : count >= total ? 'answered' : 'partial',
              answered: count,
              total,
              at,
              review: auto ? effectiveStatus(auto) : null,
              confirmed: !!auto?.confirmed_at,
            };
          } else {
            const review = latestReview.get(k);
            const pending = !!at && (!review || new Date(at) > new Date(review.reviewed_at));
            results[q.id] = {
              status: !at ? 'not_submitted' : pending ? 'under_review' : review!.result,
              at: pending || !review ? at : review.reviewed_at,
              auto: !!review?.auto_reviewed,
              // 自動添削を講師が確認して返却し直したもの
              confirmed: !!review && !review.auto_reviewed && !!review.ai_instructor_name,
            };
          }
        }
        return { user_id: s.id, name: s.display_name || s.email || s.id, company: s.company || '', department: s.department || '', results };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    return NextResponse.json({
      course,
      quizzes: quizzes.map(({ id, title, kind, video_title }) => ({ id, title, kind, video_title })),
      rows,
    });
  } catch (e) {
    console.error('[test-results] error:', e);
    return NextResponse.json({ error: 'テストの状況の取得に失敗しました' }, { status: 500 });
  }
}
