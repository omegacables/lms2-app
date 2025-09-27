import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerComponentClient({ cookies });
    const courseId = params.id;

    const { data: chapters, error } = await supabase
      .from('chapters')
      .select(`
        *,
        videos (
          id,
          title,
          display_order
        )
      `)
      .eq('course_id', courseId)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching chapters:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 章に属さない動画も取得
    const { data: unassignedVideos, error: videosError } = await supabase
      .from('videos')
      .select('id, title, display_order')
      .eq('course_id', courseId)
      .is('chapter_id', null)
      .order('display_order', { ascending: true });

    if (videosError) {
      console.error('Error fetching unassigned videos:', videosError);
      return NextResponse.json({ error: videosError.message }, { status: 500 });
    }

    return NextResponse.json({
      chapters: chapters || [],
      unassignedVideos: unassignedVideos || []
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerComponentClient({ cookies });
    const courseId = params.id;
    const body = await request.json();
    const { title } = body;

    // 現在の最大display_orderを取得
    const { data: maxOrderData, error: maxOrderError } = await supabase
      .from('chapters')
      .select('display_order')
      .eq('course_id', courseId)
      .order('display_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = maxOrderData ? maxOrderData.display_order + 1 : 0;

    const { data, error } = await supabase
      .from('chapters')
      .insert({
        course_id: courseId,
        title,
        display_order: nextOrder
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating chapter:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerComponentClient({ cookies });
    const courseId = params.id;
    const body = await request.json();
    const { chapters } = body;

    // トランザクション的に更新
    const updates = chapters.map((chapter: any, index: number) =>
      supabase
        .from('chapters')
        .update({ display_order: index })
        .eq('id', chapter.id)
    );

    const results = await Promise.all(updates);
    const hasError = results.some(result => result.error);

    if (hasError) {
      return NextResponse.json(
        { error: 'Failed to update chapter order' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}