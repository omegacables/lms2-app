import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

/**
 * コースの動画総数を取得（非公開動画も含む）
 * Service Roleクライアントを使用してRLSをバイパス
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;
    const adminSupabase = createAdminSupabaseClient();

    // 非公開動画も含めてすべての動画を取得
    const { data: videos, error } = await adminSupabase
      .from('videos')
      .select('id, duration, status')
      .eq('course_id', courseId);

    if (error) {
      console.error('動画取得エラー:', error);
      return NextResponse.json(
        { error: '動画の取得に失敗しました' },
        { status: 500 }
      );
    }

    const totalCount = videos?.length || 0;
    const activeCount = videos?.filter(v => v.status === 'active').length || 0;
    const inactiveCount = totalCount - activeCount;
    const totalDuration = videos?.reduce((sum, v) => sum + (v.duration || 0), 0) || 0;

    return NextResponse.json({
      success: true,
      data: {
        totalCount,
        activeCount,
        inactiveCount,
        totalDuration
      }
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
