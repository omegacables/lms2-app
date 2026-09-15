// 選択式テストの「回答文生成」（quizzes.answer_style='generated'）。サーバー専用。
//
// quiz_questions.choices を「回答パターン（要旨）」として扱い、受験ごとに
// 受講者が書いたような文章（回答文）へ書き起こして提示する。
//  * 書き手のイメージを受験ごとにランダムに選び、同じ設問内の回答文はすべて同じ書き手・同じ長さで書かせる
//    （文体や長さから正誤を推測できないようにするため）
//  * 表示順もシャッフルする
//  * どの表示位置がどのパターンかは quiz_choice_sets にだけ保存し、受講者には渡さない
//  * Gemini が使えない・失敗したときは、パターンの文言をそのまま（シャッフルして）提示する

import type { SupabaseClient } from '@supabase/supabase-js';
import { GeminiTimeoutError, geminiGenerateJSON, geminiModelName, isGeminiConfigured } from '@/lib/ai/gemini';

export interface ChoiceOption {
  pattern_index: number;
  text: string;
}

/** key: question_id（文字列）、値: 表示順に並んだ回答文 */
export type ChoiceSetOptions = Record<string, ChoiceOption[]>;

export interface ChoiceSet {
  id: string;
  options: ChoiceSetOptions;
  generator: string | null;
}

export interface QuestionForGeneration {
  id: number;
  question_text: string;
  choices: string[];
  explanation: string | null;
}

// 書き手のイメージ（受験ごとにランダムに1つ選ぶ）
const WRITER_PROFILES = [
  '営業部で働く30代。自分の担当業務に引きつけて書く',
  '総務部のベテラン。簡潔に、要点から書く',
  '人事部の若手。丁寧な言葉づかいで、理由を先に書く',
  '経理部の中堅。リスクや数字に触れながら慎重に書く',
  '製造現場のリーダー。現場の具体例を交えて書く',
  'マーケティング担当。前向きな語り口で、例を一つ挙げて書く',
  'カスタマーサポート担当。お客様とのやり取りを思い浮かべて書く',
  '入社2年目の社員。研修で学んだことを振り返るように書く',
  '店舗の責任者。実際の運用場面を想像しながら書く',
  '企画部の管理職。部下に説明するような口調で書く',
  '情報システム担当。仕組みや手順に目を向けて書く',
  '広報担当。読み手を意識した、わかりやすい言い回しで書く',
];

const LENGTH_RANGES = ['80〜120字', '100〜140字', '120〜160字'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fallbackOptions(q: QuestionForGeneration): ChoiceOption[] {
  return q.choices.map((c, i) => ({ pattern_index: i, text: c }));
}

async function generateForQuestion(
  q: QuestionForGeneration,
  writer: string,
  lengthRange: string
): Promise<ChoiceOption[]> {
  const patternList = q.choices.map((c, i) => `[${i}] ${c}`).join('\n');
  const prompt = `あなたは企業研修テストの出題補助です。次の設問には回答パターンが複数あります。各パターンを、受講者が自分の言葉で書いた記述回答のような文章に書き起こしてください。

設問: ${q.question_text}
回答パターン:
${patternList}
${q.explanation ? `（参考：正しい考え方）${q.explanation}` : ''}

書き方のルール:
- 書き手のイメージ: ${writer}
- すべてのパターンを同じ書き手・同じ文体・ほぼ同じ長さ（それぞれ${lengthRange}、2〜3文）で書く。文体や長さ、丁寧さの差から正誤が推測できないようにする。
- 各パターンの主張の中身は変えない。正しいパターンは正しいまま、誤ったパターンは同じ誤りを含んだまま、その人なりの自然な理由づけを添える。
- パターンの文言をそのまま写さず、言い回し・語順・具体例を変える。
- 「パターン」「選択肢」「正解」「不正解」など出題の仕組みに触れる言葉や、文字数の注記は書かない。

次のJSONのみを出力してください:
{"answers":[{"pattern":0,"text":"..."},{"pattern":1,"text":"..."}]}`;

  // 受講者を待たせないよう思考は最小にする
  const out = await geminiGenerateJSON(prompt, { purpose: 'generation', temperature: 1.0, thinking: 'minimal' });
  const answers: any[] = Array.isArray(out?.answers) ? out.answers : [];

  const byPattern = new Map<number, string>();
  for (const a of answers) {
    const idx = Number(a?.pattern);
    const text = typeof a?.text === 'string' ? a.text.trim() : '';
    if (Number.isInteger(idx) && idx >= 0 && idx < q.choices.length && text && !byPattern.has(idx)) {
      byPattern.set(idx, text);
    }
  }
  if (byPattern.size !== q.choices.length) {
    throw new Error(`回答文の生成結果が不完全です（${byPattern.size}/${q.choices.length}）`);
  }
  return q.choices.map((_, i) => ({ pattern_index: i, text: byPattern.get(i)! }));
}

async function buildOptions(questions: QuestionForGeneration[]): Promise<{ options: ChoiceSetOptions; generator: string }> {
  const writer = pick(WRITER_PROFILES);
  const lengthRange = pick(LENGTH_RANGES);
  const useAi = isGeminiConfigured();
  let fellBack = !useAi;

  const results = await Promise.all(
    questions.map(async (q) => {
      if (!useAi || q.choices.length === 0) return fallbackOptions(q);
      // 一度だけリトライし、それでも失敗したらパターンの文言で出す。
      // タイムアウトはリトライすると受講者をさらに待たせるので、すぐにパターンの文言に切り替える
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await generateForQuestion(q, writer, lengthRange);
        } catch (e) {
          console.error(`[choiceSets] 回答文の生成に失敗 (question ${q.id}, try ${attempt + 1}):`, e);
          if (e instanceof GeminiTimeoutError) break;
        }
      }
      fellBack = true;
      return fallbackOptions(q);
    })
  );

  const options: ChoiceSetOptions = {};
  questions.forEach((q, i) => {
    options[String(q.id)] = shuffle(results[i]);
  });

  const generator = useAi ? `${geminiModelName('generation')}${fellBack ? '+fallback' : ''}` : 'fallback';
  return { options, generator };
}

function coversQuestions(options: ChoiceSetOptions, questions: QuestionForGeneration[]): boolean {
  return questions.every((q) => {
    const opts = options[String(q.id)];
    return Array.isArray(opts) && opts.length === q.choices.length;
  });
}

// 同じ受講者が同じテストを同時に開いたとき（二重読み込み等）に二重生成しないための簡易ロック
const inflight = new Map<string, Promise<ChoiceSet>>();

/**
 * 未使用の提示セットがあれば再利用し（再読み込みで回答文が変わらないように）、無ければ生成する。
 * 提出に使われたセットは再利用しない＝受験のたびに新しい回答文になる。
 */
export async function getOrCreateChoiceSet(
  admin: SupabaseClient,
  userId: string,
  quizId: number,
  questions: QuestionForGeneration[]
): Promise<ChoiceSet> {
  const { data: existing } = await admin
    .from('quiz_choice_sets')
    .select('id, options, generator, created_at')
    .eq('user_id', userId)
    .eq('quiz_id', quizId)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  const latest = existing && existing.length > 0 ? existing[0] : null;
  const fresh = latest && Date.now() - new Date(latest.created_at).getTime() < 24 * 60 * 60 * 1000;
  if (latest && fresh && coversQuestions(latest.options as ChoiceSetOptions, questions)) {
    return { id: latest.id, options: latest.options as ChoiceSetOptions, generator: latest.generator };
  }

  const lockKey = `${userId}:${quizId}:${questions.map((q) => q.id).join(',')}`;
  const running = inflight.get(lockKey);
  if (running) return running;

  const task = (async () => {
    const { options, generator } = await buildOptions(questions);
    const { data, error } = await admin
      .from('quiz_choice_sets')
      .insert({ user_id: userId, quiz_id: quizId, options, generator })
      .select('id')
      .single();
    if (error || !data) throw new Error(`回答文セットの保存に失敗しました: ${error?.message}`);
    return { id: data.id as string, options, generator };
  })();

  inflight.set(lockKey, task);
  try {
    return await task;
  } finally {
    inflight.delete(lockKey);
  }
}

/** 受講者に返す形（パターン番号は含めない） */
export function toStudentOptions(options: ChoiceSetOptions, questionId: number): { key: number; text: string }[] {
  return (options[String(questionId)] || []).map((o, i) => ({ key: i, text: o.text }));
}

export interface ResolvedSelection {
  question_id: number;
  pattern_index: number;
  text: string;
}

/**
 * 提出された「表示位置」を回答パターンに変換し、提示セットを使用済みにする。
 * 使用済みにするのは条件付き UPDATE で行い、同じセットでの二重提出を防ぐ。
 * 呼び出し側で回答の保存に失敗した場合は releaseChoiceSet で戻すこと。
 */
export async function claimChoiceSet(
  admin: SupabaseClient,
  userId: string,
  quizId: number,
  choiceSetId: string,
  answers: { question_id: number; selected_index: number }[]
): Promise<
  | { ok: true; selections: ResolvedSelection[]; options: ChoiceSetOptions }
  | { ok: false; status: number; error: string }
> {
  if (!choiceSetId) {
    return { ok: false, status: 400, error: '回答文の提示情報がありません。ページを再読み込みしてください' };
  }
  const { data: set } = await admin
    .from('quiz_choice_sets')
    .select('id, user_id, quiz_id, options, consumed_at')
    .eq('id', choiceSetId)
    .maybeSingle();
  if (!set || set.user_id !== userId || set.quiz_id !== quizId) {
    return { ok: false, status: 400, error: '回答文の提示情報が一致しません。ページを再読み込みしてください' };
  }
  if (set.consumed_at) {
    return { ok: false, status: 409, error: 'この回答はすでに提出済みです。ページを再読み込みしてください' };
  }

  const options = set.options as ChoiceSetOptions;
  const selections: ResolvedSelection[] = [];
  for (const ans of answers) {
    const opts = options[String(ans.question_id)];
    const pos = Number(ans.selected_index);
    if (!opts || !Number.isInteger(pos) || pos < 0 || pos >= opts.length) {
      return { ok: false, status: 400, error: `設問${ans.question_id}の選択が不正です` };
    }
    selections.push({ question_id: Number(ans.question_id), pattern_index: opts[pos].pattern_index, text: opts[pos].text });
  }

  const { data: claimed } = await admin
    .from('quiz_choice_sets')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', choiceSetId)
    .is('consumed_at', null)
    .select('id');
  if (!claimed || claimed.length === 0) {
    return { ok: false, status: 409, error: 'この回答はすでに提出済みです。ページを再読み込みしてください' };
  }

  return { ok: true, selections, options };
}

export async function releaseChoiceSet(admin: SupabaseClient, choiceSetId: string): Promise<void> {
  await admin.from('quiz_choice_sets').update({ consumed_at: null }).eq('id', choiceSetId);
}

/** 採点結果で「正しい回答文」を示すため、セット内で正答パターンが何番目に表示されていたかを返す */
export function displayPositionOfPattern(options: ChoiceSetOptions, questionId: number, patternIndex: number): number | null {
  const opts = options[String(questionId)] || [];
  const pos = opts.findIndex((o) => o.pattern_index === patternIndex);
  return pos >= 0 ? pos : null;
}
