/**
 * ユーザー入力由来の URL を <a href> / <img src> に使う前の検証。
 * https: 以外（javascript: や data: など）は捨てる。
 */
export function safeHttpsUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
