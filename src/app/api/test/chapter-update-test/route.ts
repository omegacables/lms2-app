import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const { courseId, chapterTitle } = await request.json();
    const supabase = await createServerClient();

    console.log('[TEST] Starting chapter update test for course:', courseId);

    // 1. 現在のメタデータを取得
    const { data: course, error: fetchError } = await supabase
      .from('courses')
      .select('id, title, metadata')
      .eq('id', courseId)
      .single();

    if (fetchError) {
      return NextResponse.json({
        step: 'fetch',
        error: fetchError.message,
        details: fetchError
      }, { status: 500 });
    }

    console.log('[TEST] Current metadata:', course?.metadata);

    // 2. 新しいチャプターを準備
    const currentChapters = course?.metadata?.chapters || [];
    const newChapter = {
      id: crypto.randomUUID(),
      title: chapterTitle || 'Test Chapter',
      display_order: currentChapters.length,
      video_ids: []
    };

    const updatedChapters = [...currentChapters, newChapter];
    const updatedMetadata = {
      ...course?.metadata,
      chapters: updatedChapters
    };

    console.log('[TEST] Updated metadata to save:', updatedMetadata);

    // 3. データベースを更新（簡単な方法で）
    const { data: updateResult, error: updateError } = await supabase
      .from('courses')
      .update({
        metadata: updatedMetadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', courseId);

    if (updateError) {
      return NextResponse.json({
        step: 'update',
        error: updateError.message,
        details: updateError,
        attemptedData: updatedMetadata
      }, { status: 500 });
    }

    console.log('[TEST] Update result:', updateResult);

    // 4. 更新を確認
    const { data: verifyData, error: verifyError } = await supabase
      .from('courses')
      .select('id, title, metadata')
      .eq('id', courseId)
      .single();

    if (verifyError) {
      return NextResponse.json({
        step: 'verify',
        error: verifyError.message,
        details: verifyError
      }, { status: 500 });
    }

    console.log('[TEST] Verified metadata:', verifyData?.metadata);

    // 5. 結果を返す
    const success = verifyData?.metadata?.chapters?.length > currentChapters.length;

    return NextResponse.json({
      success,
      originalChaptersCount: currentChapters.length,
      newChaptersCount: verifyData?.metadata?.chapters?.length || 0,
      newChapter,
      allChapters: verifyData?.metadata?.chapters || [],
      course: {
        id: verifyData?.id,
        title: verifyData?.title
      },
      debug: {
        updateResult,
        hadMetadataBefore: !!course?.metadata,
        hasMetadataAfter: !!verifyData?.metadata
      }
    });

  } catch (error) {
    console.error('[TEST] Error in chapter update test:', error);
    return NextResponse.json({
      step: 'catch',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId') || '8';

    const supabase = await createServerClient();

    // コースのメタデータを取得
    const { data: course, error } = await supabase
      .from('courses')
      .select('id, title, metadata')
      .eq('id', courseId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      course: {
        id: course.id,
        title: course.title,
        metadata: course.metadata,
        chaptersCount: course.metadata?.chapters?.length || 0
      }
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}