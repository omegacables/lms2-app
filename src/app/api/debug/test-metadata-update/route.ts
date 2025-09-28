import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const { courseId } = await request.json();
    const supabase = await createServerClient();

    // テストデータ
    const testChapter = {
      id: 'test-' + Date.now(),
      title: 'テストチャプター',
      display_order: 0,
      video_ids: []
    };

    // 直接SQLでmetadataを更新
    const { data, error } = await supabase
      .rpc('update_course_metadata', {
        course_id: parseInt(courseId),
        new_metadata: { chapters: [testChapter] }
      });

    if (error) {
      // RPCが存在しない場合、通常の更新を試みる
      const { data: updateData, error: updateError } = await supabase
        .from('courses')
        .update({
          metadata: { chapters: [testChapter] }
        })
        .eq('id', courseId);

      if (updateError) {
        return NextResponse.json({
          success: false,
          error: updateError.message,
          method: 'direct_update'
        });
      }

      // 確認
      const { data: verifyData } = await supabase
        .from('courses')
        .select('metadata')
        .eq('id', courseId)
        .single();

      return NextResponse.json({
        success: true,
        method: 'direct_update',
        metadata: verifyData?.metadata,
        chaptersCount: verifyData?.metadata?.chapters?.length || 0
      });
    }

    return NextResponse.json({
      success: true,
      method: 'rpc',
      data
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId') || '8';

    const supabase = await createServerClient();

    // RLSポリシーの確認
    const { data: policies, error: policyError } = await supabase
      .rpc('check_rls_policies', { table_name: 'courses' })
      .single();

    // コースデータ取得
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .single();

    return NextResponse.json({
      course: course || null,
      courseError: courseError?.message || null,
      policies: policies || null,
      policyError: policyError?.message || null,
      hasMetadataColumn: course ? 'metadata' in course : false,
      metadataValue: course?.metadata || null
    });

  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}