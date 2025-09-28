import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // テーブルの構造を確認
    const { data: columns, error: columnsError } = await supabase
      .from('courses')
      .select('*')
      .limit(1);

    if (columnsError) {
      console.error('Error fetching courses:', columnsError);
      return NextResponse.json({
        error: columnsError.message,
        step: 'fetching courses'
      }, { status: 500 });
    }

    // 最初のコースのデータを確認
    const firstCourse = columns?.[0];

    // metadataカラムが存在するか確認
    const hasMetadataColumn = firstCourse ? 'metadata' in firstCourse : false;

    // 全コースのmetadataフィールドを確認
    const { data: allCourses, error: allCoursesError } = await supabase
      .from('courses')
      .select('id, title, metadata')
      .order('id', { ascending: true });

    if (allCoursesError) {
      return NextResponse.json({
        error: allCoursesError.message,
        step: 'fetching all courses'
      }, { status: 500 });
    }

    // 各コースのmetadataを分析
    const courseMetadataInfo = allCourses?.map(course => ({
      id: course.id,
      title: course.title,
      hasMetadata: course.metadata !== null && course.metadata !== undefined,
      metadataType: typeof course.metadata,
      metadataContent: course.metadata,
      hasChapters: course.metadata?.chapters !== undefined,
      chaptersCount: course.metadata?.chapters?.length || 0
    }));

    return NextResponse.json({
      success: true,
      hasMetadataColumn,
      firstCourse: firstCourse ? {
        id: firstCourse.id,
        title: firstCourse.title,
        metadata: firstCourse.metadata,
        allColumns: Object.keys(firstCourse)
      } : null,
      courseMetadataInfo,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Debug check-metadata error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      step: 'general error'
    }, { status: 500 });
  }
}