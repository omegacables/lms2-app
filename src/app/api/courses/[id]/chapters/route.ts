import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);
    const courseId = params.id;

    // チャプターテーブルが存在するか確認
    const { data: chaptersExist, error: tableCheckError } = await supabase
      .from('chapters')
      .select('id')
      .limit(1);

    // テーブルが存在しない場合は空の配列を返す
    if (tableCheckError && (
      tableCheckError.message.includes('does not exist') ||
      tableCheckError.message.includes('relation') ||
      tableCheckError.code === '42P01'
    )) {
      console.log('Chapters table does not exist - returning empty arrays');

      // 全ての動画を未割り当てとして返す
      const { data: allVideos, error: videosError } = await supabase
        .from('videos')
        .select('id, title, display_order')
        .eq('course_id', parseInt(courseId, 10))
        .order('display_order', { ascending: true });

      return NextResponse.json({
        chapters: [],
        unassignedVideos: allVideos || [],
        warning: 'チャプターテーブルが存在しません。/admin/setup-chapters で設定してください。'
      });
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
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);
    const courseId = params.id;
    console.log('POST /api/courses/[id]/chapters - courseId:', courseId);

    // チャプターテーブルが存在するか確認
    const { data: chaptersExist, error: tableCheckError } = await supabase
      .from('chapters')
      .select('id')
      .limit(1);

    console.log('Chapter table check:', {
      exists: !tableCheckError,
      error: tableCheckError?.message,
      data: chaptersExist
    });

    if (tableCheckError) {
      console.error('Chapters table error:', tableCheckError.message);

      // テーブルが存在しない場合の詳細なレスポンス
      if (tableCheckError.message.includes('does not exist') ||
          tableCheckError.message.includes('relation') ||
          tableCheckError.code === '42P01') {
        return NextResponse.json({
          error: 'Chapters table does not exist',
          message: 'チャプターテーブルが存在しません。Supabaseダッシュボードでテーブルを作成してください。',
          instructions: '/admin/setup-chapters にアクセスして手順を確認してください',
          sqlHint: 'CREATE TABLE chapters (id uuid primary key default gen_random_uuid(), course_id integer references courses(id), title text, display_order integer default 0, created_at timestamptz default now(), updated_at timestamptz default now())'
        }, { status: 400 });
      }

      // その他のエラー
      return NextResponse.json({
        error: 'Database error',
        message: tableCheckError.message
      }, { status: 500 });
    }

    const body = await request.json();
    const { title } = body;
    console.log('Creating chapter with title:', title);

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
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);
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