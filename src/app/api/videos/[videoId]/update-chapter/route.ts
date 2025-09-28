import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function PUT(
  request: NextRequest,
  { params }: { params: { videoId: string } }
) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);
    const videoId = params.videoId;

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 権限チェック
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || !['instructor', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: '権限が不足しています' }, { status: 403 });
    }

    const body = await request.json();
    const { chapter_title, chapter_order } = body;

    // 動画のチャプター情報を更新
    const { data, error } = await supabase
      .from('videos')
      .update({
        chapter_title: chapter_title || null,
        chapter_order: chapter_order !== undefined ? chapter_order : 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', videoId)
      .select()
      .single();

    if (error) {
      console.error('Error updating video chapter:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      video: data
    });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// 一括更新用のエンドポイント
export async function POST(
  request: NextRequest,
  { params }: { params: { videoId: string } }
) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 権限チェック
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || !['instructor', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: '権限が不足しています' }, { status: 403 });
    }

    const body = await request.json();
    const { videos } = body; // [{id, chapter_title, chapter_order}]

    if (!Array.isArray(videos)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // 一括更新
    const updates = await Promise.all(
      videos.map(video =>
        supabase
          .from('videos')
          .update({
            chapter_title: video.chapter_title || null,
            chapter_order: video.chapter_order !== undefined ? video.chapter_order : 0,
            updated_at: new Date().toISOString()
          })
          .eq('id', video.id)
      )
    );

    const hasError = updates.some(result => result.error);
    if (hasError) {
      return NextResponse.json(
        { error: 'Some updates failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Videos updated successfully'
    });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}