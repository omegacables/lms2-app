import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/database/supabase';

// Get all viewing history (admin only)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const courseId = searchParams.get('courseId');
    
    let query = supabase
      .from('video_view_logs')
      .select(`
        *,
        user_profiles:user_id (display_name),
        videos:video_id (title),
        courses:course_id (title)
      `)
      .order('last_updated', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    if (courseId) {
      query = query.eq('course_id', courseId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('視聴履歴取得エラー:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });

  } catch (error) {
    console.error('API エラー:', error);
    return NextResponse.json({ error: '内部サーバーエラー' }, { status: 500 });
  }
}

// Reset viewing history (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const videoId = searchParams.get('videoId');

    if (!userId || !videoId) {
      return NextResponse.json({ error: 'userId と videoId が必要です' }, { status: 400 });
    }

    // Reset specific video progress
    const { error } = await supabase
      .from('video_view_logs')
      .delete()
      .eq('user_id', userId)
      .eq('video_id', videoId);

    if (error) {
      console.error('視聴履歴リセットエラー:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: '視聴履歴がリセットされました' });

  } catch (error) {
    console.error('API エラー:', error);
    return NextResponse.json({ error: '内部サーバーエラー' }, { status: 500 });
  }
}

// Bulk reset viewing history for a user or course
export async function POST(request: NextRequest) {
  try {
    const { userId, courseId, videoIds } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId が必要です' }, { status: 400 });
    }

    let query = supabase
      .from('video_view_logs')
      .delete()
      .eq('user_id', userId);

    if (courseId) {
      query = query.eq('course_id', courseId);
    }

    if (videoIds && Array.isArray(videoIds)) {
      query = query.in('video_id', videoIds);
    }

    const { error } = await query;

    if (error) {
      console.error('一括視聴履歴リセットエラー:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: '視聴履歴が一括リセットされました' });

  } catch (error) {
    console.error('API エラー:', error);
    return NextResponse.json({ error: '内部サーバーエラー' }, { status: 500 });
  }
}