import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { requireRole } from '@/lib/auth/requireAdmin';

/**
 * アップロード済み動画のライブラリ一覧（管理者・講師用）。
 * 動画追加時に「既にアップロード済みの動画から選択」できるようにするための一覧。
 * 同一ファイル（file_url）は重複排除し、どのコースの動画かも返す。
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const admin = createAdminSupabaseClient();

  const { data: videos, error } = await admin
    .from('videos')
    .select(
      'id, title, description, file_url, file_path, file_size, mime_type, duration, thumbnail_url, course_id, created_at'
    )
    .not('file_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500); // ペイロード上限（将来動画数が増えた際の全件転送を防ぐ）

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // コース名を引く
  const courseIds = [...new Set((videos || []).map((v) => v.course_id).filter((x) => x != null))];
  let courseMap = new Map<number, string>();
  if (courseIds.length > 0) {
    const { data: courses } = await admin.from('courses').select('id, title').in('id', courseIds);
    courseMap = new Map((courses || []).map((c) => [c.id as number, c.title as string]));
  }

  // file_url 単位で重複排除（最新の1件を代表にする。既に created_at 降順）
  const seen = new Set<string>();
  const items: any[] = [];
  for (const v of videos || []) {
    if (!v.file_url || seen.has(v.file_url)) continue;
    seen.add(v.file_url);
    items.push({
      ...v,
      course_title: courseMap.get(v.course_id) || `コース${v.course_id}`,
    });
  }

  return NextResponse.json({ videos: items, total: items.length });
}
