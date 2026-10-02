import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export const runtime = 'nodejs';

// GET /api/admin/playback-issues?days=14
// プレイヤーから届いた再生の不調の記録（system_logs: video_playback_issue）を新しい順に返す。
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const days = Math.min(90, Math.max(1, Number(request.nextUrl.searchParams.get('days')) || 14));
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const admin = createAdminSupabaseClient();

  const { data: rows, error } = await admin
    .from('system_logs')
    .select('id, user_id, resource_id, user_agent, ip_address, details, created_at')
    .eq('action', 'video_playback_issue')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: '記録の取得に失敗しました', details: error.message }, { status: 500 });

  const userIds = Array.from(new Set((rows || []).map((r) => r.user_id).filter(Boolean)));
  const videoIds = Array.from(new Set((rows || []).map((r) => Number(r.resource_id)).filter((v) => Number.isInteger(v))));
  const [{ data: users }, { data: videos }] = await Promise.all([
    userIds.length ? admin.from('user_profiles').select('id, display_name, email, company').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
    videoIds.length ? admin.from('videos').select('id, title, course_id, file_size, duration').in('id', videoIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const courseIds = Array.from(new Set((videos || []).map((v) => v.course_id)));
  const { data: courses } = courseIds.length
    ? await admin.from('courses').select('id, title').in('id', courseIds)
    : { data: [] as any[] };
  const userMap = new Map((users || []).map((u) => [u.id, u]));
  const videoMap = new Map((videos || []).map((v) => [v.id, v]));
  const courseMap = new Map((courses || []).map((c) => [c.id, c.title]));

  const issues = (rows || []).map((r) => {
    const u = userMap.get(r.user_id);
    const v = videoMap.get(Number(r.resource_id));
    const d = (r.details || {}) as any;
    return {
      id: r.id,
      created_at: r.created_at,
      user_name: u?.display_name || u?.email || r.user_id || '',
      company: u?.company || '',
      video_id: Number(r.resource_id),
      video_title: v?.title || '',
      course_title: v ? courseMap.get(v.course_id) || '' : '',
      file_size: v?.file_size ?? null,
      video_duration: v?.duration ?? null,
      user_agent: r.user_agent || '',
      session: d.session || '',
      client: d.client || {},
      events: Array.isArray(d.events) ? d.events : [],
    };
  });

  return NextResponse.json({ issues, days });
}
