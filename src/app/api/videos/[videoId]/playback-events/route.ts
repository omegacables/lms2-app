import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/getUser';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export const runtime = 'nodejs';

// POST /api/videos/[videoId]/playback-events
// body: { access_token?, events: [{ type, at, position, buffered_ahead, src_kind, attempt?, detail? }], session, client }
//
// 再生の不調（長い読み込み待ち・復旧の試行・エラー・断念）をプレイヤーから受け取り、
// system_logs（action = 'video_playback_issue'）に残す。「動画が途切れる」の原因調査用。
// 受講者ごと・動画ごとの再生に問題があったときだけ送られてくる（正常な再生では送られない）。
const MAX_EVENTS = 40;
const MAX_DETAIL = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const body = await request.json().catch(() => ({}));
  const { user, response } = await getAuthUser(request, body.access_token);
  if (!user) return response!;

  const { videoId } = await params;
  const vid = Number(videoId);
  if (!Number.isInteger(vid) || vid <= 0) {
    return NextResponse.json({ error: 'videoId が不正です' }, { status: 400 });
  }

  const rawEvents: unknown[] = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];
  const events = rawEvents
    .map((e: any) => ({
      type: String(e?.type || '').slice(0, 30),
      at: typeof e?.at === 'string' ? e.at.slice(0, 40) : null,
      position: Number.isFinite(Number(e?.position)) ? Math.round(Number(e.position)) : null,
      buffered_ahead: Number.isFinite(Number(e?.buffered_ahead)) ? Math.round(Number(e.buffered_ahead)) : null,
      src_kind: String(e?.src_kind || '').slice(0, 20),
      attempt: Number.isFinite(Number(e?.attempt)) ? Number(e.attempt) : null,
      detail: e?.detail ? String(e.detail).slice(0, MAX_DETAIL) : null,
    }))
    .filter((e) => e.type);
  if (events.length === 0) return NextResponse.json({ ok: true, saved: 0 });

  const client = body.client && typeof body.client === 'object' ? body.client : {};
  const forwardedIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const ipAddress = /^[0-9a-fA-F:.]{3,45}$/.test(forwardedIp) ? forwardedIp : null;

  const admin = createAdminSupabaseClient();
  const { error } = await admin.from('system_logs').insert({
    user_id: user.id,
    action: 'video_playback_issue',
    resource_type: 'video',
    resource_id: String(vid),
    ip_address: ipAddress,
    user_agent: request.headers.get('user-agent')?.slice(0, 500) || null,
    details: {
      session: String(body.session || '').slice(0, 60),
      events,
      client: {
        // ブラウザが教えてくれる回線の目安（対応ブラウザのみ）
        connection: String(client.connection || '').slice(0, 20),
        downlink_mbps: Number.isFinite(Number(client.downlink_mbps)) ? Number(client.downlink_mbps) : null,
        duration: Number.isFinite(Number(client.duration)) ? Math.round(Number(client.duration)) : null,
        mobile: !!client.mobile,
        src: String(client.src || '').slice(0, 300),
      },
    },
  });
  if (error) {
    console.error('[playback-events] insert error:', error);
    return NextResponse.json({ error: '記録に失敗しました' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved: events.length });
}
