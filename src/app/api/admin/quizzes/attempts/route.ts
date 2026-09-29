import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export const runtime = 'nodejs';

// GET /api/admin/quizzes/attempts?courseId=123[&userId=uuid]
// 受講者別の回答状況一覧（全 attempt 履歴・回答日時）を返す。
// 正誤は管理画面にも表示しない仕様のため返さない（DB には記録として残る）。
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const courseId = request.nextUrl.searchParams.get('courseId');
  const userId = request.nextUrl.searchParams.get('userId');
  if (!courseId) {
    return NextResponse.json({ error: 'courseId が必要です' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // 1. コースのクイズ
  const { data: quizzes } = await admin
    .from('quizzes')
    .select('id, title, quiz_type')
    .eq('course_id', Number(courseId));
  const quizIds = (quizzes || []).map((q) => q.id);
  if (quizIds.length === 0) {
    return NextResponse.json({ attempts: [] });
  }
  const quizMap = new Map(quizzes!.map((q) => [q.id, q]));

  // 2. 回答（attempt）
  let attemptQuery = admin
    .from('quiz_attempts')
    .select('id, user_id, quiz_id, question_id, selected_index, answer_text, attempt_no, answered_at')
    .in('quiz_id', quizIds)
    .order('answered_at', { ascending: true });
  if (userId) attemptQuery = attemptQuery.eq('user_id', userId);
  const { data: attempts, error } = await attemptQuery;
  if (error) {
    return NextResponse.json({ error: '回答の取得に失敗しました', details: error.message }, { status: 500 });
  }

  // 3. 設問（本文・選択肢）
  const { data: questions } = await admin
    .from('quiz_questions')
    .select('id, question_text, choices')
    .in('quiz_id', quizIds);
  const questionMap = new Map((questions || []).map((q) => [q.id, q]));

  // 4. ユーザー情報
  const userIds = Array.from(new Set((attempts || []).map((a) => a.user_id)));
  const userMap = new Map<string, { display_name: string | null; email: string | null; company: string | null }>();
  if (userIds.length > 0) {
    const { data: users } = await admin
      .from('user_profiles')
      .select('id, display_name, email, company')
      .in('id', userIds);
    (users || []).forEach((u) => userMap.set(u.id, u));
  }

  const rows = (attempts || []).map((a) => {
    const q = questionMap.get(a.question_id);
    const quiz = quizMap.get(a.quiz_id);
    const user = userMap.get(a.user_id);
    const choices: string[] = Array.isArray(q?.choices) ? (q!.choices as string[]) : [];
    // 回答文生成の場合は選んだ回答文（answer_text）を優先する
    const selectedText =
      a.answer_text ||
      (a.selected_index !== null && a.selected_index !== undefined
        ? choices[a.selected_index] ?? `選択肢${a.selected_index + 1}`
        : '');
    return {
      id: a.id,
      user_id: a.user_id,
      user_name: user?.display_name || user?.email || a.user_id,
      company: user?.company || '',
      quiz_id: a.quiz_id,
      quiz_title: quiz?.title || '',
      quiz_type: quiz?.quiz_type || '',
      question_id: a.question_id,
      question_text: q?.question_text || '',
      selected_index: a.selected_index,
      selected_text: selectedText,
      answer_text: a.answer_text,
      attempt_no: a.attempt_no,
      answered_at: a.answered_at,
    };
  });

  return NextResponse.json({ attempts: rows });
}

// DELETE /api/admin/quizzes/attempts
// body: { attempt_ids: number[] }
// 選んだ回答（attempt）を削除する（管理者のみ）。
// - ある受講者のそのテストの回答がすべて無くなった場合は、そのテストの添削（essay_reviews）と
//   小テストの自動添削（quiz_auto_reviews）も削除し、
//   受講者が最初から受け直せる状態に戻す（小テストは未回答に戻り、以降のステップは再びロックされる）。
// - 削除した内容は system_logs に記録する（誰が・いつ・何を削除したか。削除前の回答内容も保存）。
export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, ['admin']);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.attempt_ids)
    ? Array.from(new Set(body.attempt_ids.map((v: unknown) => Number(v)).filter((v: number) => Number.isInteger(v) && v > 0)))
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: '削除する回答が選ばれていません' }, { status: 400 });
  }
  if (ids.length > 2000) {
    return NextResponse.json({ error: '一度に削除できるのは2000件までです' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // 1. 削除対象（ログ用に内容を控える）
  const { data: targets, error: fetchErr } = await admin
    .from('quiz_attempts')
    .select('*')
    .in('id', ids);
  if (fetchErr) {
    return NextResponse.json({ error: '回答の取得に失敗しました', details: fetchErr.message }, { status: 500 });
  }
  if (!targets || targets.length === 0) {
    return NextResponse.json({ error: '削除する回答が見つかりません（すでに削除されている可能性があります）' }, { status: 404 });
  }

  // 2. 回答を削除
  const { error: delErr } = await admin
    .from('quiz_attempts')
    .delete()
    .in('id', targets.map((t) => t.id));
  if (delErr) {
    return NextResponse.json({ error: '回答の削除に失敗しました', details: delErr.message }, { status: 500 });
  }

  // 3. 受講者×テストごとに、回答が残っていなければ添削も削除する
  const pairs = new Map<string, { user_id: string; quiz_id: number }>();
  targets.forEach((t) => pairs.set(`${t.user_id}:${t.quiz_id}`, { user_id: t.user_id, quiz_id: t.quiz_id }));

  const deletedReviews: any[] = [];
  const deletedAutoReviews: any[] = [];
  const resetPairs: { user_id: string; quiz_id: number }[] = [];
  for (const pair of pairs.values()) {
    const { count } = await admin
      .from('quiz_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', pair.user_id)
      .eq('quiz_id', pair.quiz_id);
    if ((count ?? 0) > 0) continue;

    resetPairs.push(pair);
    const { data: reviews } = await admin
      .from('essay_reviews')
      .select('*')
      .eq('user_id', pair.user_id)
      .eq('quiz_id', pair.quiz_id);
    if (reviews && reviews.length > 0) {
      const { error: revErr } = await admin
        .from('essay_reviews')
        .delete()
        .in('id', reviews.map((r) => r.id));
      if (revErr) {
        console.error('[admin/quizzes/attempts DELETE] essay_reviews delete error:', revErr);
      } else {
        deletedReviews.push(...reviews);
      }
    }

    // 小テストの自動添削（AI）
    const { data: autoReviews } = await admin
      .from('quiz_auto_reviews')
      .select('*')
      .eq('user_id', pair.user_id)
      .eq('quiz_id', pair.quiz_id);
    if (autoReviews && autoReviews.length > 0) {
      const { error: autoErr } = await admin
        .from('quiz_auto_reviews')
        .delete()
        .in('id', autoReviews.map((r) => r.id));
      if (autoErr) {
        console.error('[admin/quizzes/attempts DELETE] quiz_auto_reviews delete error:', autoErr);
      } else {
        deletedAutoReviews.push(...autoReviews);
      }
    }
  }

  // 4. 監査ログ（失敗しても削除自体は完了しているので処理は続ける）
  const forwardedIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const ipAddress = /^[0-9a-fA-F:.]{3,45}$/.test(forwardedIp) ? forwardedIp : null;
  const { error: logErr } = await admin.from('system_logs').insert({
    user_id: auth.user.id,
    action: 'quiz_attempts_deleted',
    resource_type: 'quiz_attempts',
    resource_id: String(targets.length),
    ip_address: ipAddress,
    user_agent: request.headers.get('user-agent') || null,
    details: {
      deleted_by: auth.user.email || auth.user.id,
      attempts: targets,
      essay_reviews: deletedReviews,
      quiz_auto_reviews: deletedAutoReviews,
      reset: resetPairs,
    },
  });
  if (logErr) console.error('[admin/quizzes/attempts DELETE] system_logs insert error:', logErr);

  return NextResponse.json({
    deleted: targets.length,
    deleted_reviews: deletedReviews.length + deletedAutoReviews.length,
    reset: resetPairs.length,
  });
}
