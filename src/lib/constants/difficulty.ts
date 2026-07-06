/**
 * コースレベル（難易度）の共通定義。
 * 表示ラベル・並び順・バッジ色はすべてここを参照する（ページごとの重複定義を禁止）。
 * DBの courses_difficulty_level_check 制約もこの5値と一致させること（両DBに適用済み）。
 */
export const DIFFICULTY_LEVELS = [
  { value: 'introduction', label: '入門' },
  { value: 'beginner', label: '初級' },
  { value: 'intermediate', label: '中級' },
  { value: 'advanced', label: '上級' },
  { value: 'expert', label: 'エキスパート' },
] as const;

export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number]['value'];

/** 値 → 日本語ラベル（未知の値はそのまま返す） */
export function difficultyLabel(value?: string | null): string {
  if (!value) return '';
  return DIFFICULTY_LEVELS.find((l) => l.value === value)?.label ?? value;
}

/** 値 → 並び順（入門=0 … エキスパート=4、未設定・未知は末尾） */
export function difficultyOrder(value?: string | null): number {
  const idx = DIFFICULTY_LEVELS.findIndex((l) => l.value === value);
  return idx === -1 ? DIFFICULTY_LEVELS.length : idx;
}

/** 値 → バッジ用のTailwindクラス（低→高で 緑→青→黄→橙→赤） */
export function difficultyBadgeClass(value?: string | null): string {
  switch (value) {
    case 'introduction':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'beginner':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'intermediate':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'advanced':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
    case 'expert':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
}

/** コース配列をレベル順（同レベル内は order_index → タイトル）で並べ替えた新配列を返す */
export function sortCoursesByDifficulty<
  T extends { difficulty_level?: string | null; order_index?: number | null; title?: string | null },
>(courses: T[]): T[] {
  return [...courses].sort((a, b) => {
    const diff = difficultyOrder(a.difficulty_level) - difficultyOrder(b.difficulty_level);
    if (diff !== 0) return diff;
    const orderA = a.order_index ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.order_index ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return (a.title ?? '').localeCompare(b.title ?? '', 'ja');
  });
}
