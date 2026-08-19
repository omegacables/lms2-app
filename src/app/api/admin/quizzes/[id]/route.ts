import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export const runtime = 'nodejs';

// GET /api/admin/quizzes/[id]
// クイズ詳細＋設問（正答・解説を含む＝管理者向け）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const admin = createAdminSupabaseClient();

  const { data: quiz, error: quizError } = await admin
    .from('quizzes')
    .select('*')
    .eq('id', Number(id))
    .single();

  if (quizError || !quiz) {
    return NextResponse.json({ error: 'クイズが見つかりません' }, { status: 404 });
  }

  const { data: questions, error: qError } = await admin
    .from('quiz_questions')
    .select('*')
    .eq('quiz_id', Number(id))
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (qError) {
    return NextResponse.json({ error: '設問の取得に失敗しました', details: qError.message }, { status: 500 });
  }

  return NextResponse.json({ quiz, questions: questions || [] });
}

// PATCH /api/admin/quizzes/[id]
// クイズのメタ情報を更新（title / quiz_type / after_video_id / sort_order / status）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json();
  const update: Record<string, unknown> = {};

  if (typeof body.title === 'string') update.title = body.title.slice(0, 200);
  if (body.quiz_type && ['choice', 'essay'].includes(body.quiz_type)) update.quiz_type = body.quiz_type;
  if ('after_video_id' in body) update.after_video_id = body.after_video_id ? Number(body.after_video_id) : null;
  if (Number.isFinite(body.sort_order)) update.sort_order = Number(body.sort_order);
  if (body.status && ['draft', 'published'].includes(body.status)) update.status = body.status;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '更新項目がありません' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // 公開しようとしている場合の妥当性チェック（選択式は2問・4択・正答必須を推奨）
  if (update.status === 'published') {
    const { data: questions } = await admin
      .from('quiz_questions')
      .select('id, choices, correct_index, quiz_id')
      .eq('quiz_id', Number(id));
    const { data: quizRow } = await admin.from('quizzes').select('quiz_type').eq('id', Number(id)).single();
    const qs = questions || [];
    if (qs.length === 0) {
      return NextResponse.json({ error: '設問が1問もないため公開できません' }, { status: 400 });
    }
    if (quizRow?.quiz_type === 'choice') {
      const invalid = qs.find(
        (q) =>
          !Array.isArray(q.choices) ||
          q.choices.length < 2 ||
          q.correct_index === null ||
          q.correct_index === undefined ||
          q.correct_index < 0 ||
          q.correct_index >= (q.choices as unknown[]).length
      );
      if (invalid) {
        return NextResponse.json(
          { error: '選択式は全設問に2つ以上の選択肢と正しい正答番号が必要です' },
          { status: 400 }
        );
      }
    }
  }

  const { data, error } = await admin
    .from('quizzes')
    .update(update)
    .eq('id', Number(id))
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'クイズの更新に失敗しました', details: error.message }, { status: 500 });
  }
  return NextResponse.json({ quiz: data });
}

// DELETE /api/admin/quizzes/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const admin = createAdminSupabaseClient();

  // 回答実績があるクイズは削除不可（記録保全）。設問だけは CASCADE で消える点に注意し、
  // 実績がある場合は非公開化を促す。
  const { count } = await admin
    .from('quiz_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('quiz_id', Number(id));

  if ((count || 0) > 0) {
    return NextResponse.json(
      { error: '受講者の回答記録があるため削除できません。非公開（draft）にしてください。' },
      { status: 409 }
    );
  }

  const { error } = await admin.from('quizzes').delete().eq('id', Number(id));
  if (error) {
    return NextResponse.json({ error: 'クイズの削除に失敗しました', details: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
