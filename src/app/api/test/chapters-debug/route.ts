import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // 1. Get first course
    const { data: courses, error: coursesError } = await supabase
      .from('courses')
      .select('*')
      .limit(1);

    if (coursesError) {
      return NextResponse.json({
        step: 'fetch_courses',
        error: coursesError.message
      }, { status: 500 });
    }

    if (!courses || courses.length === 0) {
      return NextResponse.json({
        step: 'fetch_courses',
        error: 'No courses found'
      }, { status: 404 });
    }

    const course = courses[0];

    // 2. Check metadata column value
    const metadataValue = course.metadata;
    const metadataType = typeof metadataValue;
    const metadataIsNull = metadataValue === null;
    const metadataIsUndefined = metadataValue === undefined;

    // 3. Try to update metadata if it's null
    let updateResult = null;
    let updateError = null;

    if (metadataIsNull || metadataIsUndefined) {
      const { data, error } = await supabase
        .from('courses')
        .update({
          metadata: { chapters: [] }
        })
        .eq('id', course.id)
        .select();

      updateResult = data;
      updateError = error;
    }

    // 4. Fetch course again after update
    const { data: updatedCourse, error: refetchError } = await supabase
      .from('courses')
      .select('*')
      .eq('id', course.id)
      .single();

    // 5. Test adding a chapter
    let chapterAddResult = null;
    let chapterAddError = null;

    const testChapter = {
      id: crypto.randomUUID(),
      title: 'Test Chapter ' + Date.now(),
      display_order: 0,
      video_ids: []
    };

    const currentMetadata = updatedCourse?.metadata || { chapters: [] };
    const currentChapters = currentMetadata.chapters || [];
    currentChapters.push(testChapter);

    const { data: chapterUpdateData, error: chapterUpdateError } = await supabase
      .from('courses')
      .update({
        metadata: { ...currentMetadata, chapters: currentChapters }
      })
      .eq('id', course.id)
      .select();

    chapterAddResult = chapterUpdateData;
    chapterAddError = chapterUpdateError;

    // 6. Final verification
    const { data: finalCourse, error: finalError } = await supabase
      .from('courses')
      .select('*')
      .eq('id', course.id)
      .single();

    return NextResponse.json({
      success: true,
      courseId: course.id,
      courseTitle: course.title,
      initialMetadata: {
        value: metadataValue,
        type: metadataType,
        isNull: metadataIsNull,
        isUndefined: metadataIsUndefined
      },
      updateAttempt: {
        result: updateResult,
        error: updateError?.message
      },
      afterUpdate: {
        metadata: updatedCourse?.metadata,
        error: refetchError?.message
      },
      chapterAdd: {
        testChapter,
        result: chapterAddResult,
        error: chapterAddError?.message
      },
      finalState: {
        metadata: finalCourse?.metadata,
        chaptersCount: finalCourse?.metadata?.chapters?.length || 0,
        error: finalError?.message
      }
    });

  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Clear all metadata for testing
    const { data: courses, error: fetchError } = await supabase
      .from('courses')
      .select('id');

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const results = [];

    for (const course of courses || []) {
      const { data, error } = await supabase
        .from('courses')
        .update({ metadata: { chapters: [] } })
        .eq('id', course.id)
        .select();

      results.push({
        courseId: course.id,
        success: !error,
        data,
        error: error?.message
      });
    }

    return NextResponse.json({
      message: 'Metadata reset for all courses',
      results
    });

  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}