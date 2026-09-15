// 赤ペン添削の下書きを Gemini で生成する（サーバー専用）。
// 返却の最終確定は必ず講師が行う。署名（講師名）は表示時に返却した講師の名前を付けるので、AI には書かせない。

import { geminiGenerateJSON } from '@/lib/ai/gemini';
import { normalizeMarkup, type RedPenSegment } from '@/lib/quiz/redpen';

export interface RedPenDraftInput {
  courseTitle: string;
  quizTitle: string;
  questionText: string;
  /** 添削対象の文章（選択式は選んだ回答文、記述式は記述） */
  answerText: string;
  /** 選択式の正答の要旨（記述式は空） */
  correctText?: string;
  explanation?: string | null;
  /** 選択式で内容の正誤が決まっている場合 true/false、記述式は null */
  knownCorrect: boolean | null;
}

export interface RedPenDraft {
  markup: RedPenSegment[] | null;
  summary: string;
  is_correct: boolean | null;
}

export function buildRedPenPrompt(i: RedPenDraftInput): string {
  const context = [
    `コース名: ${i.courseTitle}`,
    `テスト名: ${i.quizTitle}`,
    `設問: ${i.questionText}`,
    i.correctText ? `正しい考え方: ${i.correctText}` : '',
    i.explanation ? `解説: ${i.explanation}` : '',
    i.knownCorrect === null ? '' : `この回答文の内容は、正しい考え方に${i.knownCorrect ? '沿っています' : '沿っていません'}。`,
  ]
    .filter(Boolean)
    .join('\n');

  return `あなたは企業研修のベテラン講師です。受講者が提出した回答文を、赤ペンで添削してください。

${context}
受講者の回答文:
"""${i.answerText}"""

添削の方法:
- 回答文は受講者本人の言葉で書かれた文章として扱う。一人称や語り口（「〜と考えています」など）は直さず、直すのは内容の誤り・不足・あいまいな点に絞る。
- 回答文を先頭から末尾まで区切り、segments の配列で表す。type は "keep"（そのまま）／"del"（赤の取り消し線で消す部分）／"ins"（赤で書き足す部分）。
- keep と del の text を順につなげると、受講者の回答文と一字一句同じになるようにする（句読点・空白も変えない）。ins は直す箇所の del の直後に置く。
- keep と ins を順につなげた「添削後の文章」が、重複や言葉の抜けのない自然な日本語として読めるようにする。前後の keep と意味が重なる場合は、その部分も del に含めて書き直す。
- 誤り・不足がある箇所は del と ins で直し、そのどちらかに note（吹き出しのコメント。なぜ直すのかを40〜80字で）を付ける。良い箇所には keep に note を付けて評価してもよい。
- 内容が正しい場合は、修正は0〜2か所の軽い補強にとどめ、良い点を note で具体的に評価する。
- 内容が誤っている場合は、誤りの中心となる部分を正しい考え方に直し、2〜4か所に note を付ける。
- note や summary に文字数の注記、署名、講師名は書かない。

次のJSONのみを出力してください:
{"segments":[{"type":"keep","text":"..."},{"type":"del","text":"...","note":"..."},{"type":"ins","text":"..."}],"summary":"この設問への総評（80〜160字）","is_correct":true}`;
}

/** 区切りが回答文と一致しない場合は1回だけ作り直し、それでも駄目なら markup なしで返す */
export async function draftRedPen(i: RedPenDraftInput): Promise<RedPenDraft> {
  if (!i.answerText.trim()) return { markup: null, summary: '', is_correct: i.knownCorrect };

  const prompt = buildRedPenPrompt(i);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await geminiGenerateJSON(prompt, { purpose: 'review', temperature: 0.7 });
      const markup = normalizeMarkup(i.answerText, out?.segments);
      if (!markup) throw new Error('赤ペンの区切りが回答文と一致しません');
      return {
        markup,
        summary: String(out?.summary || ''),
        // 選択式は内容の正誤が決まっているのでそれを使う。記述式は AI の判断を初期値にする
        is_correct: i.knownCorrect !== null ? i.knownCorrect : typeof out?.is_correct === 'boolean' ? out.is_correct : null,
      };
    } catch (e) {
      console.error(`[redpenDraft] 赤ペン生成に失敗 (try ${attempt + 1}):`, e);
    }
  }
  return { markup: null, summary: '', is_correct: i.knownCorrect };
}
