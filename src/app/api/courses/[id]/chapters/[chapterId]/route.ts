import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; chapterId: string } }
) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);
    const { chapterId } = params;

    // チャプターテーブルが存在するか確認
    const { data: chaptersExist, error: tableCheckError } = await supabase
      .from('chapters')
      .select('id')
      .limit(1);

    if (tableCheckError && tableCheckError.message.includes('does not exist')) {
      return NextResponse.json({
        error: 'Chapters table does not exist',
        message: 'Please create the chapters table first'
      }, { status: 400 });
    }

    const body = await request.json();
    const { title } = body;

    const { data, error } = await supabase
      .from('chapters')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', chapterId)
      .select()
      .single();

    if (error) {
      console.error('Error updating chapter:', error);
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; chapterId: string } }
) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);
    const { chapterId } = params;

    // チャプターテーブルが存在するか確認
    const { data: chaptersExist, error: tableCheckError } = await supabase
      .from('chapters')
      .select('id')
      .limit(1);

    if (tableCheckError && tableCheckError.message.includes('does not exist')) {
      return NextResponse.json({
        error: 'Chapters table does not exist',
        message: 'Please create the chapters table first'
      }, { status: 400 });
    }

    // 章に属する動画のchapter_idをnullに設定
    const { error: updateError } = await supabase
      .from('videos')
      .update({ chapter_id: null })
      .eq('chapter_id', chapterId);

    if (updateError) {
      console.error('Error updating videos:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 章を削除
    const { error } = await supabase
      .from('chapters')
      .delete()
      .eq('id', chapterId);

    if (error) {
      console.error('Error deleting chapter:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
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