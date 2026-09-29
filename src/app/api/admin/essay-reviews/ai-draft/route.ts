import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { geminiGenerateJSON, isGeminiConfigured } from '@/lib/ai/gemini';
import { draftRedPen } from '@/lib/quiz/redpenDraft';

export const runtime = 'nodejs';

// POST /api/admin/essay-reviews/ai-draft
// body: { quiz_id, user_id }
// Gemini で添削の下書きを生成して返す（記述式・選択式の提出→添削の両方に対応）。
//   question_reviews … 設問ごとの赤ペン（取り消し線・書き足し・吹き出し）と正誤案
//   comment / explanation / result … 全体の添削コメント・解説・合否案
// ★ 返却の最終確定は必ず指導者が行う（このAPIは下書き生成のみ。DBには書き込まない）。
//   署名（講師名）は表示時に返却した指導者の名前を付けるので、AI には書かせない。
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
  const questionList = questions || [];

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

  // 設問ごとの「添削対象の文章」と、選択式なら内容の正誤
  const targets = questionList.map((q) => {
    const choices: string[] = Array.isArray(q.choices) ? (q.choices as string[]) : [];
    const a = latestAnswer.get(q.id);
    const sel = a?.selected_index;
    const text =
      a?.answer_text || (isChoice && sel !== null && sel !== undefined ? choices[sel] ?? '' : '');
    const hasCorrect = isChoice && q.correct_index !== null && q.correct_index !== undefined;
    return {
      q,
      text,
      correctText: hasCorrect ? choices[q.correct_index as number] ?? '' : '',
      knownCorrect: hasCorrect && sel !== null && sel !== undefined ? sel === q.correct_index : null,
    };
  });

  const header = `コース名: ${course?.title || ''}\nテスト名: ${quiz.title}`;

  // --- 設問ごとの赤ペン ---
  const redPenFor = async (t: (typeof targets)[number]) => {
    const d = await draftRedPen({
      courseTitle: course?.title || '',
      quizTitle: quiz.title,
      questionText: t.q.question_text,
      answerText: t.text,
      correctText: t.correctText,
      explanation: t.q.explanation,
      knownCorrect: t.knownCorrect,
    });
    // 正誤は付けない仕様のため返さない（コメントと赤ペンのみ）
    return { question_id: t.q.id, is_correct: null, comment: d.summary, markup: d.markup };
  };

  // --- 全体の添削コメント・解説・合否案 ---
  const overall = async () => {
    const qaText = targets
      .map((t, i) => {
        const lines = [`問${i + 1}. ${t.q.question_text}`, `受講者の回答文: ${t.text || '（未回答）'}`];
        if (t.correctText) lines.push(`正しい考え方: ${t.correctText}`);
        if (t.q.explanation) lines.push(`解説: ${t.q.explanation}`);
        return lines.join('\n');
      })
      .join('\n\n');

    const prompt = `あなたは企業研修の経験豊富な日本語の講師です。以下のテストについて、受講者の回答文を添削してください。

${header}

${qaText}

以下の点を必ず守ってください:
- 受講者の回答文の具体的な記述に触れ、良い点と改善点を指摘する（定型文にならないように、この受講者専用の添削にする）。
- 実際のベテラン講師が書くような、丁寧で温かく、かつ的確な語り口にする。
- 解説では、各設問で押さえるべきポイントを分かりやすく示す。
- 回答が要点を十分満たしていれば "passed"、修正が必要なら "needs_revision" とする。${
      isChoice ? '（内容が正しい考え方に沿っていない設問がある場合は "needs_revision"）' : ''
    }
- 署名や講師名、文字数の注記は書かない。

次のJSON形式のみで出力してください:
{
  "comment": "添削コメント（受講者への総評、150〜300字）",
  "explanation": "解説（各設問で押さえるべきポイント）",
  "result": "passed" または "needs_revision"
}`;
    const draft = await geminiGenerateJSON(prompt, { purpose: 'review', temperature: 0.8 });
    return {
      comment: String(draft.comment || ''),
      explanation: String(draft.explanation || ''),
      result: draft.result === 'passed' ? 'passed' : 'needs_revision',
    };
  };

  try {
    const [questionReviews, whole] = await Promise.all([Promise.all(targets.map(redPenFor)), overall()]);

    // 1問だけのテストは、設問の総評と全体コメントが重複するので設問側は吹き出しに任せる
    const qr = questionReviews.length === 1 ? questionReviews.map((r) => ({ ...r, comment: '' })) : questionReviews;

    // 選択式で内容の正誤が決まっている場合、合否案もそれに合わせる
    const knownAll = targets.every((t) => t.knownCorrect !== null);
    const result = knownAll ? (targets.every((t) => t.knownCorrect) ? 'passed' : 'needs_revision') : whole.result;

    return NextResponse.json({
      comment: whole.comment,
      explanation: whole.explanation,
      result,
      question_reviews: qr,
    });
  } catch (e) {
    return NextResponse.json({ error: `AI下書きの生成に失敗しました: ${String(e)}` }, { status: 502 });
  }
}
