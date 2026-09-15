// 赤ペン添削のデータ形式（サーバー・クライアント共通）。
//
// 回答文を先頭から区切った segments の配列で表す。
//   keep … そのまま（note があれば該当箇所をマーカー表示し、吹き出しを付ける）
//   del  … 赤の取り消し線で消す部分
//   ins  … 赤で書き足す部分
// keep と del の text をつなげると元の回答文と一字一句一致する、という不変条件を持つ。
// これを満たさない添削は壊れているとみなし、保存・表示しない（元の回答文だけを表示する）。

export type RedPenType = 'keep' | 'del' | 'ins';

export interface RedPenSegment {
  type: RedPenType;
  text: string;
  note?: string | null;
}

const MAX_NOTE = 400;

/** keep と del をつないだ文字列（＝元の回答文になるはず） */
export function originalFromMarkup(segments: RedPenSegment[]): string {
  return segments.filter((s) => s.type !== 'ins').map((s) => s.text).join('');
}

/** 添削後の文章（keep と ins をつないだもの） */
export function correctedFromMarkup(segments: RedPenSegment[]): string {
  return segments.filter((s) => s.type !== 'del').map((s) => s.text).join('');
}

/**
 * 受け取った添削データを検証して整形する。元の回答文と一致しなければ null。
 * 改行コード・前後の空白の違いは吸収する。
 */
export function normalizeMarkup(original: string, raw: unknown): RedPenSegment[] | null {
  if (!Array.isArray(raw)) return null;
  const segments: RedPenSegment[] = [];
  for (const item of raw) {
    const type = (item as any)?.type;
    const text = (item as any)?.text;
    if (!['keep', 'del', 'ins'].includes(type) || typeof text !== 'string') return null;
    if (text === '') continue;
    const noteRaw = (item as any)?.note;
    const note = typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim().slice(0, MAX_NOTE) : null;
    segments.push({ type, text: text.replace(/\r\n/g, '\n'), note });
  }
  if (segments.length === 0) return null;

  const norm = (s: string) => s.replace(/\r\n/g, '\n').trim();
  if (norm(originalFromMarkup(segments)) !== norm(original)) return null;
  return segments;
}

/** 吹き出しを持つ箇所か（編集中の空文字も吹き出しとして扱う。保存時に空は null になる） */
export function hasNote(s: RedPenSegment): boolean {
  return s.note !== null && s.note !== undefined;
}

/** 吹き出し（note）が付いた箇所に 1 から番号を振る。戻り値は segments と同じ長さ（番号なしは null） */
export function noteNumbers(segments: RedPenSegment[]): (number | null)[] {
  let n = 0;
  return segments.map((s) => (hasNote(s) ? ++n : null));
}

/**
 * 指導者が画面で「この修正を取り消す」を選んだとき。
 * del は keep に戻し、ins は消す。del と ins は「消して書き直す」ひと組になっていることが多いので、
 * del の直後の ins／ins の直前の del も一緒に戻す（不変条件は保たれる）。keep はコメントだけ外す。
 */
export function revertSegment(segments: RedPenSegment[], index: number): RedPenSegment[] {
  const target = segments[index];
  if (!target) return segments;

  const touched = new Set<number>([index]);
  if (target.type === 'del' && segments[index + 1]?.type === 'ins') touched.add(index + 1);
  if (target.type === 'ins' && segments[index - 1]?.type === 'del') touched.add(index - 1);

  const next: RedPenSegment[] = [];
  segments.forEach((sg, i) => {
    if (!touched.has(i)) {
      next.push(sg);
      return;
    }
    if (sg.type === 'del') next.push({ type: 'keep', text: sg.text, note: null });
    else if (sg.type === 'keep') next.push({ ...sg, note: null });
    // ins は取り除く
  });

  // 隣り合う keep（コメントなし）をまとめる
  const merged: RedPenSegment[] = [];
  for (const sg of next) {
    const last = merged[merged.length - 1];
    if (last && last.type === 'keep' && sg.type === 'keep' && !hasNote(last) && !hasNote(sg)) {
      last.text += sg.text;
    } else {
      merged.push({ ...sg });
    }
  }
  return merged;
}

/** 1〜20 は丸数字（①〜⑳）、それ以上は (21) のように表す */
export function circledNumber(n: number): string {
  return n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : `(${n})`;
}
