import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

// POST: チャプターに動画を追加
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { video_id } = await request.json();

    if (!video_id) {
      return NextResponse.json(
        { error: 'video_id は必須です' },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();

    // 現在の最大display_orderを取得
    const { data: maxOrderData } = await supabase
      .from('chapter_videos')
      .select('display_order')
      .eq('chapter_id', params.id)
      .order('display_order', { ascending: false })
      .limit(1);

    const nextOrder = maxOrderData && maxOrderData.length > 0
      ? (maxOrderData[0].display_order || 0) + 1
      : 0;

    // チャプターに動画を追加
    const { data, error } = await supabase
      .from('chapter_videos')
      .insert({
        chapter_id: parseInt(params.id),
        video_id: parseInt(video_id),
        display_order: nextOrder
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error adding video to chapter:', error);
    return NextResponse.json(
      { error: '動画の追加に失敗しました' },
      { status: 500 }
    );
  }
}

// DELETE: チャプターから動画を削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('video_id');

    if (!videoId) {
      return NextResponse.json(
        { error: 'video_id は必須です' },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();

    const { error } = await supabase
      .from('chapter_videos')
      .delete()
      .eq('chapter_id', params.id)
      .eq('video_id', videoId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: '動画をチャプターから削除しました'
    });

  } catch (error) {
    console.error('Error removing video from chapter:', error);
    return NextResponse.json(
      { error: '動画の削除に失敗しました' },
      { status: 500 }
    );
  }
}

// PUT: チャプター内の動画順序を更新
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { videos } = await request.json();

    if (!Array.isArray(videos)) {
      return NextResponse.json(
        { error: 'videos配列が必要です' },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();

    // 各動画の順序を更新
    const updatePromises = videos.map((video, index) =>
      supabase
        .from('chapter_videos')
        .update({ display_order: index })
        .eq('chapter_id', params.id)
        .eq('video_id', video.video_id)
    );

    await Promise.all(updatePromises);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error updating video order:', error);
    return NextResponse.json(
      { error: '動画順序の更新に失敗しました' },
      { status: 500 }
    );
  }
}