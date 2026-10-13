// Resend（https://resend.com）でメールを送る（サーバー専用）。
//
// 環境変数（Vercel に登録）:
//   RESEND_API_KEY  … Resend の API キー（Sending access）。無ければ送信しない
//   EMAIL_FROM      … 送信元（既定 "eラーニングシステム <noreply@stus-lms.com>"。Resend で認証したドメインのアドレス）
//   EMAIL_REPLY_TO  … 返信先（任意）
//   EMAIL_COPY_TO   … 管理者への控えの送り先（任意・カンマ区切りで複数可）。公開リポジトリなのでアドレスはコードに書かない
//
// 1宛先1通で送る（ほかの受信者のアドレスが見えないように）。バッチ API は1回100通まで。

const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';
const BATCH_LIMIT = 100;

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

export interface SendResult {
  sent: { to: string; id: string }[];
  failed: { to: string; error: string }[];
}

export function emailSendingConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export function emailFromAddress(): string {
  return process.env.EMAIL_FROM || 'eラーニングシステム <noreply@stus-lms.com>';
}

/** 管理者への控えの送り先（EMAIL_COPY_TO）。無ければ空 */
export function emailCopyRecipients(): string[] {
  return (process.env.EMAIL_COPY_TO || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

/**
 * まとめて送る（100通ずつ）。idempotencyKey を渡すと、同じ依頼を2回送っても Resend 側で1回にまとまる。
 */
export async function sendEmailsIndividually(emails: OutgoingEmail[], idempotencyKey?: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY が設定されていません');
  const from = emailFromAddress();
  const replyTo = process.env.EMAIL_REPLY_TO || undefined;

  const result: SendResult = { sent: [], failed: [] };
  for (let i = 0; i < emails.length; i += BATCH_LIMIT) {
    const chunk = emails.slice(i, i + BATCH_LIMIT);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    if (idempotencyKey) headers['Idempotency-Key'] = `${idempotencyKey}-${i / BATCH_LIMIT}`.slice(0, 256);

    try {
      const res = await fetch(RESEND_BATCH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(
          chunk.map((m) => ({
            from,
            to: [m.to],
            subject: m.subject,
            text: m.text,
            ...(replyTo ? { reply_to: replyTo } : {}),
          }))
        ),
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = json?.message || json?.error || `HTTP ${res.status}`;
        chunk.forEach((m) => result.failed.push({ to: m.to, error: String(message) }));
        continue;
      }
      const ids: { id: string }[] = Array.isArray(json?.data) ? json.data : [];
      chunk.forEach((m, k) => {
        if (ids[k]?.id) result.sent.push({ to: m.to, id: ids[k].id });
        else result.failed.push({ to: m.to, error: '送信IDが返りませんでした' });
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      chunk.forEach((m) => result.failed.push({ to: m.to, error: message }));
    }
  }
  return result;
}
