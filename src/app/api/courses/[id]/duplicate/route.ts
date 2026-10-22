import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/database/adminSupabase';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { copyCourse, CopyCourseError } from '@/lib/course/copyCourse';

export const maxDuration = 60;

/**
 * コースをコピーする（管理者専用）。body: { title?: string }（省略時は「元の名前-コピー1-」）。
 * 動画ファイルは複製せず元のコースと同じものを再生し、小テスト・最終テストはコピーしない。
 * 詳細は lib/course/copyCourse.ts。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const sourceId = parseInt(id);
  if (!sourceId || isNaN(sourceId)) {
    return NextResponse.json({ error: '無効なコースIDです' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));

  try {
    const result = await copyCourse(adminSupabase, {
      sourceId,
      title: typeof body?.title === 'string' ? body.title : undefined,
      userId: auth.user.id,
    });
    return NextResponse.json({
      success: true,
      newCourseId: result.course.id,
      course: result.course,
      copiedVideos: result.copiedVideos,
      copiedChapters: result.copiedChapters,
      copiedResources: result.copiedResources,
      message: 'コースをコピーしました',
    });
  } catch (error) {
    console.error('コースのコピーエラー:', error);
    const status = error instanceof CopyCourseError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'コースのコピー中にエラーが発生しました' },
      { status }
    );
  }
}
