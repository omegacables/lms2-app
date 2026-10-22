// コースのコピーの既定名。「元の名前-コピー1-」とし、同じ名前が既にあれば番号を進める。
// コピーをさらにコピーしたときは「-コピーN-」を重ねず、元の名前に次の番号を付ける。

/** courses.title は varchar(200) */
export const COURSE_TITLE_MAX = 200;

const COPY_SUFFIX = /-コピー(\d+)-$/;

export function defaultCopyTitle(sourceTitle: string, existingTitles: string[]): string {
  const base = sourceTitle.trim().replace(COPY_SUFFIX, '');
  let max = 0;
  for (const t of existingTitles) {
    const s = (t || '').trim();
    if (!s.startsWith(base)) continue;
    const m = s.slice(base.length).match(/^-コピー(\d+)-$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const suffix = `-コピー${max + 1}-`;
  return `${base.slice(0, COURSE_TITLE_MAX - suffix.length)}${suffix}`;
}
