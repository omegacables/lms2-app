import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { requireAdmin } from '@/lib/auth/requireAdmin';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await params;
    if (!targetUserId) return NextResponse.json({ error: 'IDが指定されていません' }, { status: 400 });
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const supabaseAdmin = createAdminSupabaseClient();

    // オプション: 特定のコースやビデオのみリセット
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('course_id');
    const videoId = searchParams.get('video_id');

    let query = supabaseAdmin
      .from('video_view_logs')
      .delete()
      .eq('user_id', targetUserId);

    if (courseId) {
      query = query.eq('course_id', courseId);
    }

    if (videoId) {
      query = query.eq('video_id', videoId);
    }

    const { data, error } = await query.select();

    if (error) {
      console.error('学習ログリセットエラー:', error);
      return NextResponse.json({ error: '学習ログのリセットに失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `${data?.length || 0}件の学習ログを削除しました`
    });

  } catch (error) {
    console.error('学習ログリセットエラー:', error);
    return NextResponse.json({
      error: '学習ログのリセットに失敗しました',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
