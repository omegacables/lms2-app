import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { emailFromAddress, emailSendingConfigured, sendEmailsIndividually } from '@/lib/email/resend';

export const runtime = 'nodejs';

// GET  /api/admin/email/send  送信の設定状況（送信元アドレス・設定済みか）
// POST /api/admin/email/send  body: { user_ids: string[], subject, body, request_id, context? }
//   管理者が選んだ受講者に、1人1通ずつシステムから送る（Resend）。
//   宛先のメールアドレスはクライアントから受け取らず、user_ids から DB で引く。
//   本文の {氏名} {メールアドレス} は宛先ごとに置き換える。
//   本文に「XXXXXX」（初回パスワードの書き換え忘れ）が残っていたら送らない。
//   送った記録は system_logs（action = 'admin_email_sent'）に残す。

const MAX_RECIPIENTS = 500;

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin']);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ configured: emailSendingConfigured(), from: emailFromAddress() });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin']);
  if (!auth.ok) return auth.response;

  if (!emailSendingConfigured()) {
    return NextResponse.json(
      { error: 'メール送信の設定（RESEND_API_KEY）がまだのため送信できません。管理者にお問い合わせください。' },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const userIds: string[] = Array.isArray(body.user_ids) ? Array.from(new Set(body.user_ids.map(String))) : [];
  const subject = String(body.subject || '').trim();
  const text = String(body.body || '');
  const requestId = String(body.request_id || '').slice(0, 100);
  const context = body.context ? String(body.context).slice(0, 200) : null;

  if (userIds.length === 0) return NextResponse.json({ error: '宛先がありません' }, { status: 400 });
  if (userIds.length > MAX_RECIPIENTS) {
    return NextResponse.json({ error: `一度に送れるのは${MAX_RECIPIENTS}名までです` }, { status: 400 });
  }
  if (!subject || subject.length > 200) return NextResponse.json({ error: '件名を入力してください（200文字以内）' }, { status: 400 });
  if (!text.trim() || text.length > 20000) return NextResponse.json({ error: '本文を入力してください（20000文字以内）' }, { status: 400 });
  if (text.includes('XXXXXX')) {
    return NextResponse.json({ error: '本文に「XXXXXX」が残っています。初回パスワードに書き換えてから送信してください。' }, { status: 400 });
  }
  if (!requestId) return NextResponse.json({ error: 'request_id が必要です' }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const profiles: { id: string; display_name: string | null; email: string | null }[] = [];
  for (let i = 0; i < userIds.length; i += 200) {
    const { data, error } = await admin
      .from('user_profiles')
      .select('id, display_name, email')
      .in('id', userIds.slice(i, i + 200));
    if (error) return NextResponse.json({ error: '宛先の取得に失敗しました', details: error.message }, { status: 500 });
    profiles.push(...(data || []));
  }
  const recipients = profiles.filter((p) => p.email && /\S+@\S+\.\S+/.test(p.email));
  const missing = userIds.length - recipients.length;
  if (recipients.length === 0) return NextResponse.json({ error: 'メールアドレスのある宛先がありません' }, { status: 400 });

  const personalize = (s: string, p: (typeof recipients)[number]) =>
    s.split('{氏名}').join(p.display_name || '').split('{メールアドレス}').join(p.email || '');

  const result = await sendEmailsIndividually(
    recipients.map((p) => ({ to: p.email!, subject: personalize(subject, p), text: personalize(text, p) })),
    `admin-email-${requestId}`
  );

  const { error: logError } = await admin.from('system_logs').insert({
    user_id: auth.user.id,
    action: 'admin_email_sent',
    resource_type: 'email',
    resource_id: requestId,
    details: {
      context,
      subject,
      from: emailFromAddress(),
      sent: result.sent,
      failed: result.failed,
      recipients: recipients.map((p) => ({ id: p.id, email: p.email })),
      missing_email: missing,
      body_length: text.length,
    },
  });
  if (logError) console.error('[admin email] system_logs への記録に失敗:', logError);

  return NextResponse.json({ sent: result.sent.length, failed: result.failed, missing_email: missing });
}
