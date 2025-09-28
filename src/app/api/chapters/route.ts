import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

// GET: チャプター一覧取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('course_id');

    const supabase = await createServerClient();

    if (courseId) {
      // 特定コースのチャプター取得
      const { data: chapters, error } = await supabase
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
        .eq('course_id', courseId)
        .order('display_order', { ascending: true });

      if (error) throw error;

      return NextResponse.json({ chapters: chapters || [] });
    } else {
      // 全チャプター取得
      const { data: chapters, error } = await supabase
        .from('chapters')
        .select('*')
        .order('course_id', { ascending: true })
        .order('display_order', { ascending: true });

      if (error) throw error;

      return NextResponse.json({ chapters: chapters || [] });
    }
  } catch (error) {
    console.error('Error fetching chapters:', error);
    return NextResponse.json(
      { error: 'チャプターの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// POST: 新規チャプター作成
export async function POST(request: NextRequest) {
  try {
    const { course_id, title, description } = await request.json();

    if (!course_id || !title) {
      return NextResponse.json(
        { error: 'course_id と title は必須です' },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();

    // 現在の最大display_orderを取得
    const { data: maxOrderData } = await supabase
      .from('chapters')
      .select('display_order')
      .eq('course_id', course_id)
      .order('display_order', { ascending: false })
      .limit(1);

    const nextOrder = maxOrderData && maxOrderData.length > 0
      ? (maxOrderData[0].display_order || 0) + 1
      : 0;

    // チャプターを作成
    const { data: chapter, error } = await supabase
      .from('chapters')
      .insert({
        course_id: parseInt(course_id),
        title,
        description: description || null,
        display_order: nextOrder
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      chapter
    });

  } catch (error) {
    console.error('Error creating chapter:', error);
    return NextResponse.json(
      { error: 'チャプターの作成に失敗しました' },
      { status: 500 }
    );
  }
}

// PUT: チャプター順序更新
export async function PUT(request: NextRequest) {
  try {
    const { chapters } = await request.json();

    if (!Array.isArray(chapters)) {
      return NextResponse.json(
        { error: 'chapters配列が必要です' },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();

    // 各チャプターの順序を更新
    const updatePromises = chapters.map((chapter, index) =>
      supabase
        .from('chapters')
        .update({ display_order: index })
        .eq('id', chapter.id)
    );

    await Promise.all(updatePromises);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error updating chapters order:', error);
    return NextResponse.json(
      { error: 'チャプター順序の更新に失敗しました' },
      { status: 500 }
    );
  }
}