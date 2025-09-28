import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function PUT(
  request: NextRequest,
  { params }: { params: { videoId: string } }
) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    const { chapterId } = await request.json();
    const videoId = parseInt(params.videoId);

    // ビデオの情報を取得
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .select('course_id')
      .eq('id', videoId)
      .single();

    if (videoError) {
      return NextResponse.json({ error: videoError.message }, { status: 500 });
    }

    // コースのメタデータを取得
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('metadata')
      .eq('id', video.course_id)
      .single();

    if (courseError) {
      return NextResponse.json({ error: courseError.message }, { status: 500 });
    }

    // metadataがnullの場合の処理
    const metadata = course?.metadata || { chapters: [] };
    const chapters = metadata.chapters || [];

    // すべてのチャプターから該当動画IDを削除
    const updatedChapters = chapters.map((chapter: any) => ({
      ...chapter,
      video_ids: (chapter.video_ids || []).filter((id: number) => id !== videoId)
    }));

    // 新しいチャプターに動画を追加
    if (chapterId) {
      const chapterIndex = updatedChapters.findIndex((ch: any) => ch.id === chapterId);
      if (chapterIndex !== -1) {
        updatedChapters[chapterIndex].video_ids = [
          ...(updatedChapters[chapterIndex].video_ids || []),
          videoId
        ];
      }
    }

    // metadataを更新
    const { error: updateError } = await supabase
      .from('courses')
      .update({
        metadata: { ...metadata, chapters: updatedChapters },
        updated_at: new Date().toISOString()
      })
      .eq('id', video.course_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error assigning video to chapter:', error);
    return NextResponse.json(
      { error: 'Failed to assign video to chapter' },
      { status: 500 }
    );
  }
}