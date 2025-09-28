import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

// GET: 個別チャプター取得
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerClient();

    const { data: chapter, error } = await supabase
      .from('chapters')
      .select(`
        *,
        chapter_videos (
          id,
          video_id,
          display_order,
          videos (
            id,
            title,
            duration,
            thumbnail_url
          )
        )
      `)
      .eq('id', params.id)
      .single();

    if (error) throw error;

    return NextResponse.json({ chapter });

  } catch (error) {
    console.error('Error fetching chapter:', error);
    return NextResponse.json(
      { error: 'チャプターの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// PUT: チャプター更新
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { title, description, display_order } = await request.json();
    const supabase = await createServerClient();

    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (display_order !== undefined) updateData.display_order = display_order;

    const { data: chapter, error } = await supabase
      .from('chapters')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      chapter
    });

  } catch (error) {
    console.error('Error updating chapter:', error);
    return NextResponse.json(
      { error: 'チャプターの更新に失敗しました' },
      { status: 500 }
    );
  }
}

// DELETE: チャプター削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerClient();

    const { error } = await supabase
      .from('chapters')
      .delete()
      .eq('id', params.id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'チャプターを削除しました'
    });

  } catch (error) {
    console.error('Error deleting chapter:', error);
    return NextResponse.json(
      { error: 'チャプターの削除に失敗しました' },
      { status: 500 }
    );
  }
}