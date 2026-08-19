import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { geminiGenerateJSON, isGeminiConfigured } from '@/lib/ai/gemini';

export const runtime = 'nodejs';

// POST /api/admin/essay-reviews/ai-draft
// body: { quiz_id, user_id }
// Gemini で「添削コメント＋解説＋合否案」の下書きを生成して返す。
// ★ 返却の最終確定は必ず指導者が行う（このAPIは下書き生成のみ。DBには書き込まない）。
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  if (!isGeminiConfigured()) {
    return NextResponse.json(
      { error: 'AI下書きは未設定です（環境変数 GEMINI_API_KEY を設定してください）' },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { quiz_id, user_id } = body;
  if (!quiz_id || !user_id) {
    return NextResponse.json({ error: 'quiz_id / user_id が必要です' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: quiz } = await admin
    .from('quizzes')
    .select('id, course_id, title, quiz_type')
    .eq('id', Number(quiz_id))
    .single();
  if (!quiz || quiz.quiz_type !== 'essay') {
    return NextResponse.json({ error: '記述式テストが見つかりません' }, { status: 404 });
  }

  const { data: course } = await admin.from('courses').select('title').eq('id', quiz.course_id).single();

  const { data: questions } = await admin
    .from('quiz_questions')
    .select('id, question_text, sort_order')
    .eq('quiz_id', quiz.id)
    .order('sort_order', { ascending: true });

  const { data: attempts } = await admin
    .from('quiz_attempts')
    .select('question_id, answer_text, answered_at')
    .eq('quiz_id', quiz.id)
    .eq('user_id', user_id)
    .order('answered_at', { ascending: false });
  const latestAnswer = new Map<number, string>();
  (attempts || []).forEach((a) => { if (!latestAnswer.has(a.question_id)) latestAnswer.set(a.question_id, a.answer_text || ''); });

  const qaText = (questions || [])
    .map((q, i) => `問${i + 1}. ${q.question_text}\n受講者の回答: ${latestAnswer.get(q.id) || '（未回答）'}`)
    .join('\n\n');

  const prompt = `あなたは企業研修の経験豊富な日本語の講師です。以下の記述式最終テストについて、受講者の回答を添削してください。

コース名: ${course?.title || ''}
テスト名: ${quiz.title}

${qaText}

以下の点を必ず守ってください:
- 受講者の回答の具体的な記述に触れ、良い点と改善点を個別に指摘する（定型文・使い回しにならないように、この受講者専用の添削にする）。
- 実際のベテラン講師が書くような、丁寧で温かく、かつ的確な語り口にする。
- 解説では、各設問の模範解答の要点・押さえるべきポイントを分かりやすく示す。
- 回答が要点を十分満たしていれば "passed"、修正が必要なら "needs_revision" とする。

次のJSON形式のみで、日本語で出力してください（他の文章は出力しない）:
{
  "comment": "添削コメント（受講者への総評・各回答への具体的なフィードバック）",
  "explanation": "解説（各設問の模範解答の要点）",
  "result": "passed" または "needs_revision"
}`;

  try {
    const draft = await geminiGenerateJSON(prompt, { temperature: 0.9 });
    const result = draft.result === 'passed' ? 'passed' : 'needs_revision';
    return NextResponse.json({
      comment: String(draft.comment || ''),
      explanation: String(draft.explanation || ''),
      result,
    });
  } catch (e) {
    return NextResponse.json({ error: `AI下書きの生成に失敗しました: ${String(e)}` }, { status: 502 });
  }
}
