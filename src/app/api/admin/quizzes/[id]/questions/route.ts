import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export const runtime = 'nodejs';

interface IncomingQuestion {
  question_text: string;
  choices?: string[];
  correct_index?: number | null;
  explanation?: string | null;
}

// PUT /api/admin/quizzes/[id]/questions
// 設問を丸ごと差し替える。受講者の回答記録があるクイズは構成変更不可（記録保全）。
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const quizId = Number(id);
  const admin = createAdminSupabaseClient();

  const { data: quiz } = await admin.from('quizzes').select('quiz_type').eq('id', quizId).single();
  if (!quiz) return NextResponse.json({ error: 'クイズが見つかりません' }, { status: 404 });

  // 回答記録があれば構成変更を拒否
  const { count } = await admin
    .from('quiz_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('quiz_id', quizId);
  if ((count || 0) > 0) {
    return NextResponse.json(
      { error: '受講者の回答記録があるため設問を変更できません。' },
      { status: 409 }
    );
  }

  const body = await request.json();
  const incoming: IncomingQuestion[] = Array.isArray(body.questions) ? body.questions : [];

  // バリデーション
  for (const [i, q] of incoming.entries()) {
    if (!q.question_text || !String(q.question_text).trim()) {
      return NextResponse.json({ error: `設問${i + 1}の本文が空です` }, { status: 400 });
    }
    if (quiz.quiz_type === 'choice') {
      const choices = (q.choices || []).map((c) => String(c ?? '').trim());
      if (choices.length < 2) {
        return NextResponse.json({ error: `設問${i + 1}は選択肢が2つ以上必要です` }, { status: 400 });
      }
      if (
        q.correct_index === null ||
        q.correct_index === undefined ||
        q.correct_index < 0 ||
        q.correct_index >= choices.length
      ) {
        return NextResponse.json({ error: `設問${i + 1}の正答番号が不正です` }, { status: 400 });
      }
    }
  }

  // 既存設問を削除して差し替え（回答記録が無いことは上で確認済み）
  const { error: delError } = await admin.from('quiz_questions').delete().eq('quiz_id', quizId);
  if (delError) {
    return NextResponse.json({ error: '既存設問の削除に失敗しました', details: delError.message }, { status: 500 });
  }

  if (incoming.length === 0) {
    return NextResponse.json({ questions: [] });
  }

  const rows = incoming.map((q, idx) => ({
    quiz_id: quizId,
    question_text: String(q.question_text).trim(),
    choices: quiz.quiz_type === 'choice' ? (q.choices || []).map((c) => String(c ?? '').trim()) : [],
    correct_index: quiz.quiz_type === 'choice' ? Number(q.correct_index) : null,
    explanation: q.explanation ? String(q.explanation) : null,
    sort_order: idx,
  }));

  const { data, error } = await admin.from('quiz_questions').insert(rows).select();
  if (error) {
    return NextResponse.json({ error: '設問の保存に失敗しました', details: error.message }, { status: 500 });
  }

  return NextResponse.json({ questions: data });
}
