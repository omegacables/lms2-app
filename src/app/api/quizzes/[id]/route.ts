import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/getUser';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { computeGateState } from '@/lib/quiz/gating';

export const runtime = 'nodejs';

// GET /api/quizzes/[id]
// 受講者向け：クイズの設問（正答・解説は含まない）＋自分の回答履歴＋通過状況を返す。
// ゲート未解放のクイズは 403。
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await getAuthUser(request);
  if (!user) return response!;

  const { id } = await params;
  const quizId = Number(id);
  const admin = createAdminSupabaseClient();

  const { data: quiz } = await admin
    .from('quizzes')
    .select('id, course_id, title, quiz_type, status, after_video_id')
    .eq('id', quizId)
    .single();
  if (!quiz || quiz.status !== 'published') {
    return NextResponse.json({ error: 'クイズが見つかりません' }, { status: 404 });
  }

  // ゲート判定（解放されているか）
  const state = await computeGateState(admin, user.id, quiz.course_id);
  const gate = state.quizUnlocked[quizId];
  if (gate && !gate.unlocked) {
    return NextResponse.json(
      { error: `このテストはまだ受けられません。先に${gate.reason || '前のステップ'}を完了してください。`, locked: true },
      { status: 403 }
    );
  }

  // 設問（安全なフィールドのみ）
  const { data: questions } = await admin
    .from('quiz_questions')
    .select('id, question_text, choices, sort_order')
    .eq('quiz_id', quizId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  // 自分の回答履歴（設問ごとに最新の attempt）
  const { data: attempts } = await admin
    .from('quiz_attempts')
    .select('question_id, selected_index, answer_text, is_correct, attempt_no, answered_at')
    .eq('quiz_id', quizId)
    .eq('user_id', user.id)
    .order('answered_at', { ascending: false });

  const latestByQuestion = new Map<number, any>();
  (attempts || []).forEach((a) => {
    if (!latestByQuestion.has(a.question_id)) latestByQuestion.set(a.question_id, a);
  });

  return NextResponse.json({
    quiz: {
      id: quiz.id,
      course_id: quiz.course_id,
      title: quiz.title,
      quiz_type: quiz.quiz_type,
      after_video_id: quiz.after_video_id,
    },
    questions: (questions || []).map((q) => ({
      id: q.id,
      question_text: q.question_text,
      choices: Array.isArray(q.choices) ? q.choices : [],
      sort_order: q.sort_order,
      my_answer: latestByQuestion.get(q.id)
        ? {
            selected_index: latestByQuestion.get(q.id).selected_index,
            answer_text: latestByQuestion.get(q.id).answer_text,
            is_correct: latestByQuestion.get(q.id).is_correct,
            attempt_no: latestByQuestion.get(q.id).attempt_no,
            answered_at: latestByQuestion.get(q.id).answered_at,
          }
        : null,
    })),
    passed: !!state.quizPassed[quizId],
  });
}
