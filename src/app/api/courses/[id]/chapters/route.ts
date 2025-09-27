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

    // 認証チェック
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('GET chapters - No session found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
      .eq('course_id', parseInt(courseId, 10)) // 数値に変換
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching chapters:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 章に属さない動画も取得
    const { data: unassignedVideos, error: videosError } = await supabase
      .from('videos')
      .select('id, title, display_order')
      .eq('course_id', parseInt(courseId, 10)) // 数値に変換
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
    console.log('POST /api/courses/[id]/chapters - courseId:', courseId);

    // 認証チェック
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('No session found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title } = body;
    console.log('Creating chapter with title:', title, 'by user:', session.user.email);

    if (!title || title.trim() === '') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // 現在の最大display_orderを取得
    const { data: maxOrderData, error: maxOrderError } = await supabase
      .from('chapters')
      .select('display_order')
      .eq('course_id', parseInt(courseId, 10)) // 数値に変換
      .order('display_order', { ascending: false })
      .limit(1);

    console.log('Max order data:', maxOrderData, 'Error:', maxOrderError);

    // single()を使わず、配列として処理
    const nextOrder = (maxOrderData && maxOrderData.length > 0)
      ? maxOrderData[0].display_order + 1
      : 0;

    console.log('Inserting chapter with order:', nextOrder);

    const { data, error } = await supabase
      .from('chapters')
      .insert({
        course_id: parseInt(courseId, 10), // 数値に変換
        title: title.trim(),
        display_order: nextOrder
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating chapter:', error);
      console.error('Error details:', {
        code: error.code,
        details: error.details,
        hint: error.hint,
        message: error.message
      });
      return NextResponse.json({
        error: error.message,
        details: error.details,
        hint: error.hint
      }, { status: 500 });
    }

    console.log('Chapter created successfully:', data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Unexpected error in POST chapters:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
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