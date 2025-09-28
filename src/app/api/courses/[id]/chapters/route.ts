import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerClient();

    console.log(`[GET /api/courses/${params.id}/chapters] Fetching chapters`);

    // コース情報を取得
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('metadata')
      .eq('id', params.id)
      .single();

    if (courseError) {
      console.error('Error fetching course:', courseError);
      return NextResponse.json({ error: courseError.message }, { status: 500 });
    }

    console.log(`[GET] Course metadata:`, course?.metadata);

    // metadataがnullの場合、デフォルト値を設定
    if (!course?.metadata) {
      console.log('[GET] Metadata is null, initializing with empty chapters array');
      const { error: initError } = await supabase
        .from('courses')
        .update({ metadata: { chapters: [] } })
        .eq('id', params.id);

      if (initError) {
        console.error('[GET] Error initializing metadata:', initError);
      }
    }

    // チャプター情報を取得（metadataから）
    const chapters = course?.metadata?.chapters || [];
    console.log(`[GET] Chapters from metadata:`, chapters);

    // 動画を取得
    const { data: videos, error: videosError } = await supabase
      .from('videos')
      .select('*')
      .eq('course_id', params.id)
      .order('order_index', { ascending: true });

    if (videosError) {
      return NextResponse.json({ error: videosError.message }, { status: 500 });
    }

    // チャプターに動画を割り当て
    const chaptersWithVideos = chapters.map((chapter: any) => ({
      ...chapter,
      videos: videos?.filter((video: any) =>
        chapter.video_ids?.includes(video.id)
      ) || []
    }));

    // 未割り当ての動画を取得
    const assignedVideoIds = chapters.flatMap((ch: any) => ch.video_ids || []);
    const unassignedVideos = videos?.filter((video: any) =>
      !assignedVideoIds.includes(video.id)
    ) || [];

    console.log(`[GET] Returning ${chaptersWithVideos.length} chapters and ${unassignedVideos.length} unassigned videos`);

    return NextResponse.json({
      chapters: chaptersWithVideos,
      unassignedVideos
    });
  } catch (error) {
    console.error('Error fetching chapters:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chapters' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerClient();
    const { title } = await request.json();

    console.log(`[POST /api/courses/${params.id}/chapters] Creating chapter with title:`, title);

    // 現在のコース情報を取得
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('metadata')
      .eq('id', params.id)
      .single();

    if (courseError) {
      console.error('Error fetching course for POST:', courseError);
      return NextResponse.json({ error: courseError.message }, { status: 500 });
    }

    console.log(`[POST] Current course metadata:`, course?.metadata);

    // metadataがnullの場合、初期化
    const metadata = course?.metadata || { chapters: [] };

    // 新しいチャプターを作成
    // 重要: 配列のコピーを作成して新しいチャプターを追加
    const existingChapters = metadata.chapters || [];
    const newChapter = {
      id: crypto.randomUUID(),
      title,
      display_order: existingChapters.length,
      video_ids: []
    };

    const chapters = [...existingChapters, newChapter];

    const updatedMetadata = { ...metadata, chapters };
    console.log(`[POST] Updated metadata to save:`, JSON.stringify(updatedMetadata, null, 2));
    console.log(`[POST] Number of chapters to save:`, chapters.length);
    console.log(`[POST] Chapter IDs:`, chapters.map((c: any) => c.id));

    // metadataを更新
    const { data: updateData, error: updateError } = await supabase
      .from('courses')
      .update({
        metadata: updatedMetadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select();

    if (updateError) {
      console.error('[POST] Update error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    console.log(`[POST] Update result:`, JSON.stringify(updateData, null, 2));
    console.log(`[POST] Update error (if any):`, updateError);

    // 更新後のデータを確認
    const { data: verifyData, error: verifyError } = await supabase
      .from('courses')
      .select('metadata')
      .eq('id', params.id)
      .single();

    console.log(`[POST] Verification - Updated metadata in DB:`, JSON.stringify(verifyData?.metadata, null, 2));
    console.log(`[POST] Verify error (if any):`, verifyError);

    if (verifyData?.metadata?.chapters?.length === 0) {
      console.error('[POST] WARNING: Chapters were not saved to database!');
      console.log('[POST] Attempting to debug the issue...');
      console.log('[POST] Course ID:', params.id);
      console.log('[POST] Expected chapters count:', chapters.length);
      console.log('[POST] Actual chapters count in DB:', verifyData?.metadata?.chapters?.length);
    }

    return NextResponse.json(newChapter);
  } catch (error) {
    console.error('Error creating chapter:', error);
    return NextResponse.json(
      { error: 'Failed to create chapter' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerClient();
    const { chapters } = await request.json();

    // metadataを更新（チャプター順序の更新用）
    const { error: updateError } = await supabase
      .from('courses')
      .update({
        metadata: { chapters },
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating chapters:', error);
    return NextResponse.json(
      { error: 'Failed to update chapters' },
      { status: 500 }
    );
  }
}