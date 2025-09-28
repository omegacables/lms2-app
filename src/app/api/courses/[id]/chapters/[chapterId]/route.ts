import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; chapterId: string } }
) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    const { title } = await request.json();

    // 現在のコース情報を取得
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('metadata')
      .eq('id', params.id)
      .single();

    if (courseError) {
      return NextResponse.json({ error: courseError.message }, { status: 500 });
    }

    // metadataがnullの場合の処理
    const metadata = course?.metadata || { chapters: [] };

    // チャプターを更新
    const chapters = metadata.chapters || [];
    const updatedChapters = chapters.map((chapter: any) =>
      chapter.id === params.chapterId
        ? { ...chapter, title }
        : chapter
    );

    // metadataを更新
    const { error: updateError } = await supabase
      .from('courses')
      .update({
        metadata: { ...metadata, chapters: updatedChapters },
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating chapter:', error);
    return NextResponse.json(
      { error: 'Failed to update chapter' },
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
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    // 現在のコース情報を取得
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('metadata')
      .eq('id', params.id)
      .single();

    if (courseError) {
      return NextResponse.json({ error: courseError.message }, { status: 500 });
    }

    // metadataがnullの場合の処理
    const metadata = course?.metadata || { chapters: [] };

    // チャプターを削除
    const chapters = metadata.chapters || [];
    const updatedChapters = chapters.filter(
      (chapter: any) => chapter.id !== params.chapterId
    );

    // metadataを更新
    const { error: updateError } = await supabase
      .from('courses')
      .update({
        metadata: { ...metadata, chapters: updatedChapters },
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting chapter:', error);
    return NextResponse.json(
      { error: 'Failed to delete chapter' },
      { status: 500 }
    );
  }
}