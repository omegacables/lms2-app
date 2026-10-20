/**
 * 動画の長さ（秒）をブラウザで読み取る。
 * メタデータだけを読むので本体のダウンロードは発生しない。読めない場合は 0 を返す。
 */
function readDuration(src: string, timeoutMs: number, revoke: boolean): Promise<number> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(0);
    const video = document.createElement('video');
    video.preload = 'metadata';
    let done = false;
    const finish = (value: number) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (revoke) {
        try { URL.revokeObjectURL(video.src); } catch { /* noop */ }
      }
      video.removeAttribute('src');
      video.load();
      resolve(value);
    };
    const timer = setTimeout(() => finish(0), timeoutMs);
    video.onloadedmetadata = () => {
      const d = Number.isFinite(video.duration) ? Math.round(video.duration) : 0;
      finish(d > 0 ? d : 0);
    };
    video.onerror = () => finish(0);
    video.src = src;
  });
}

/** 選択したファイルから長さを取得（アップロード前） */
export function getVideoFileDuration(file: File, timeoutMs = 30_000): Promise<number> {
  return readDuration(URL.createObjectURL(file), timeoutMs, true);
}

/** 配信中の URL から長さを取得（差し替え後の再取得用） */
export function getVideoUrlDuration(url: string, timeoutMs = 30_000): Promise<number> {
  if (!url) return Promise.resolve(0);
  return readDuration(url, timeoutMs, false);
}

/** "H:MM:SS" / "MM:SS" / "秒数" / "90分" を秒に変換。解釈できなければ null */
export function parseDurationInput(raw: string): number | null {
  const s = raw
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)) // 全角数字を半角に
    .replace(/[：]/g, ':')
    .replace(/\s+/g, '');
  if (!s) return null;
  const minMatch = s.match(/^(\d+)分(?:(\d+)秒?)?$/);
  if (minMatch) return parseInt(minMatch[1], 10) * 60 + (minMatch[2] ? parseInt(minMatch[2], 10) : 0);
  const secMatch = s.match(/^(\d+)秒?$/);
  if (secMatch) return parseInt(secMatch[1], 10);
  const parts = s.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map((p) => parseInt(p, 10));
  return parts.length === 3 ? nums[0] * 3600 + nums[1] * 60 + nums[2] : nums[0] * 60 + nums[1];
}

/** 秒を "H:MM:SS" または "MM:SS" に */
export function formatDurationHms(seconds: number): string {
  const total = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}
