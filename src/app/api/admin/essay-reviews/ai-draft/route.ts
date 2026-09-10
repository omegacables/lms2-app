import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { geminiGenerateJSON, isGeminiConfigured } from '@/lib/ai/gemini';

export const runtime = 'nodejs';

// POST /api/admin/essay-reviews/ai-draft
// body: { quiz_id, user_id }
// Gemini で「添削コメント＋解説＋合否案」の下書きを生成して返す。
// 記述式・選択式（提出→添削）の両方に対応する。
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
    .select('id, course_id, title, quiz_type, grading_mode')
    .eq('id', Number(quiz_id))
    .single();
  if (!quiz || (quiz.quiz_type !== 'essay' && quiz.grading_mode !== 'review')) {
    return NextResponse.json({ error: '添削対象のテストが見つかりません' }, { status: 404 });
  }
  const isChoice = quiz.quiz_type === 'choice';

  const { data: course } = await admin.from('courses').select('title').eq('id', quiz.course_id).single();

  const { data: questions } = await admin
    .from('quiz_questions')
    .select('id, question_text, choices, correct_index, explanation, sort_order')
    .eq('quiz_id', quiz.id)
    .order('sort_order', { ascending: true });

  const { data: attempts } = await admin
    .from('quiz_attempts')
    .select('question_id, answer_text, selected_index, answered_at')
    .eq('quiz_id', quiz.id)
    .eq('user_id', user_id)
    .order('answered_at', { ascending: false });
  const latestAnswer = new Map<number, { answer_text: string | null; selected_index: number | null }>();
  (attempts || []).forEach((a) => {
    if (!latestAnswer.has(a.question_id)) {
      latestAnswer.set(a.question_id, { answer_text: a.answer_text, selected_index: a.selected_index });
    }
  });

  const qaText = (questions || [])
    .map((q, i) => {
      const a = latestAnswer.get(q.id);
      if (!isChoice) {
        return `問${i + 1}. ${q.question_text}\n受講者の回答: ${a?.answer_text || '（未回答）'}`;
      }
      const choices: string[] = Array.isArray(q.choices) ? (q.choices as string[]) : [];
      const choiceList = choices.map((c, ci) => `  ${ci + 1}. ${c}`).join('\n');
      const sel = a?.selected_index;
      const selected =
        sel !== null && sel !== undefined ? `${sel + 1}. ${choices[sel] ?? ''}` : '（未回答）';
      const correct =
        q.correct_index !== null && q.correct_index !== undefined
          ? `${q.correct_index + 1}. ${choices[q.correct_index] ?? ''}`
          : '（正答未設定）';
      return `問${i + 1}. ${q.question_text}\n選択肢:\n${choiceList}\n受講者が選んだ回答: ${selected}\n正答: ${correct}${
        q.explanation ? `\n出題者の解説: ${q.explanation}` : ''
      }`;
    })
    .join('\n\n');

  const prompt = `あなたは企業研修の経験豊富な日本語の講師です。以下の${
    isChoice ? '選択式の最終テスト' : '記述式最終テスト'
  }について、受講者の回答を添削してください。

コース名: ${course?.title || ''}
テスト名: ${quiz.title}

${qaText}

以下の点を必ず守ってください:
- 受講者の回答内容に具体的に触れ、良い点と改善点を個別に指摘する（定型文・使い回しにならないように、この受講者専用の添削にする）。
${
  isChoice
    ? '- 設問ごとに、受講者が選んだ選択肢がなぜ正しい／誤っているのかを説明する。誤答した設問は特に丁寧に解説する。'
    : ''
}- 実際のベテラン講師が書くような、丁寧で温かく、かつ的確な語り口にする。
- 解説では、各設問の模範解答の要点・押さえるべきポイントを分かりやすく示す。
- 回答が要点を十分満たしていれば "passed"、修正が必要なら "needs_revision" とする。${
    isChoice ? '（誤答がある場合は原則 "needs_revision"）' : ''
  }

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
