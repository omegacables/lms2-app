/**
 * UUID v4 を生成する。
 *
 * `crypto.randomUUID()` は Safari/iOS 15.4 以降でしか存在しないため、
 * それ以前の端末（古いiPad等）ではガードなしに呼ぶと
 * `crypto.randomUUID is not a function` で例外になり、
 * 呼び出し元のコンポーネントが描画時にクラッシュする。
 *
 * ここでは以下の順でフォールバックする:
 *   1. crypto.randomUUID()            … 対応環境（最速・標準）
 *   2. crypto.getRandomValues()        … iOS Safari 7+ で利用可。品質は同等
 *   3. Math.random()                   … 最終手段（crypto 自体が無い場合のみ）
 *
 * 用途は視聴ログの session_id 等でありセキュリティ用途ではないため、
 * いずれのフォールバックでも実用上の問題はない。
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    if (typeof crypto.getRandomValues === 'function') {
      // RFC 4122 準拠の UUID v4 を getRandomValues から組み立てる
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
      return (
        hex.slice(0, 4).join('') +
        '-' +
        hex.slice(4, 6).join('') +
        '-' +
        hex.slice(6, 8).join('') +
        '-' +
        hex.slice(8, 10).join('') +
        '-' +
        hex.slice(10, 16).join('')
      );
    }
  }

  // crypto が全く使えない環境向けの最終フォールバック
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
