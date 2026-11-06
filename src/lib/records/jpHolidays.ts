// 日本の祝日（国民の祝日に関する法律、2020年以降の規定）。
// 振替休日・国民の休日も含む。春分・秋分の日は 1980〜2099 年に使える近似式で求める。
// 2020・2021 年は東京オリンピックの特例で海の日・スポーツの日・山の日が移動している。

const cache = new Map<number, Set<string>>();

const ymd = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** その月の第 n 月曜日 */
function nthMonday(y: number, m: number, n: number): number {
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const firstMonday = 1 + ((8 - firstDow) % 7);
  return firstMonday + (n - 1) * 7;
}

function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

function holidaysOf(y: number): Set<string> {
  const hit = cache.get(y);
  if (hit) return hit;

  const base = new Set<string>();
  const add = (m: number, d: number) => base.add(ymd(y, m, d));

  add(1, 1); // 元日
  add(1, nthMonday(y, 1, 2)); // 成人の日
  add(2, 11); // 建国記念の日
  if (y >= 2020) add(2, 23); // 天皇誕生日
  add(3, Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4))); // 春分の日
  add(4, 29); // 昭和の日
  add(5, 3); // 憲法記念日
  add(5, 4); // みどりの日
  add(5, 5); // こどもの日
  if (y === 2020) {
    add(7, 23); // 海の日
    add(7, 24); // スポーツの日
    add(8, 10); // 山の日
  } else if (y === 2021) {
    add(7, 22);
    add(7, 23);
    add(8, 8);
  } else {
    add(7, nthMonday(y, 7, 3)); // 海の日
    add(8, 11); // 山の日
    add(10, nthMonday(y, 10, 2)); // スポーツの日
  }
  add(9, nthMonday(y, 9, 3)); // 敬老の日
  add(9, Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4))); // 秋分の日
  add(11, 3); // 文化の日
  add(11, 23); // 勤労感謝の日

  const all = new Set(base);
  // 国民の休日：前日と翌日が祝日の平日
  for (const d of base) {
    const next = addDays(d, 1);
    const nextNext = addDays(d, 2);
    if (!base.has(next) && base.has(nextNext) && new Date(`${next}T00:00:00Z`).getUTCDay() !== 0) all.add(next);
  }
  // 振替休日：祝日が日曜日なら、その後の最初の祝日でない日
  for (const d of Array.from(base).sort()) {
    if (new Date(`${d}T00:00:00Z`).getUTCDay() !== 0) continue;
    let sub = addDays(d, 1);
    while (all.has(sub)) sub = addDays(sub, 1);
    all.add(sub);
  }

  cache.set(y, all);
  return all;
}

/** date は 'YYYY-MM-DD' */
export function isJapaneseHoliday(date: string): boolean {
  const y = Number(date.slice(0, 4));
  if (!Number.isFinite(y)) return false;
  return holidaysOf(y).has(date);
}
