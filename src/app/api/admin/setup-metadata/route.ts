import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    // 権限チェック
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // まず、すべてのコースを取得
    const { data: courses, error: fetchError } = await supabase
      .from('courses')
      .select('*');

    if (fetchError) {
      console.error('Error fetching courses:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // metadataカラムが存在するか確認
    const hasMetadataColumn = courses && courses.length > 0 && 'metadata' in courses[0];

    if (!hasMetadataColumn) {
      // metadataカラムが存在しない場合、デフォルト値で更新を試みる
      // Supabaseでは直接ALTER TABLEできないため、既存のレコードに対してmetadataフィールドを追加
      const updatePromises = courses?.map(course =>
        supabase
          .from('courses')
          .update({
            metadata: { chapters: [] },
            updated_at: new Date().toISOString()
          })
          .eq('id', course.id)
      ) || [];

      const results = await Promise.all(updatePromises);
      const errors = results.filter(r => r.error);

      if (errors.length > 0) {
        console.error('Errors updating courses:', errors.map(e => e.error));
        return NextResponse.json({
          message: 'Metadata column does not exist. Please add it manually in Supabase.',
          sql: `ALTER TABLE courses ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{"chapters": []}'::jsonb;`,
          errors: errors.map(e => e.error?.message)
        }, { status: 500 });
      }
    } else {
      // metadataカラムは存在するが、nullまたは不完全な場合の修正
      const updatePromises = courses?.filter(course =>
        !course.metadata || !course.metadata.chapters
      ).map(course =>
        supabase
          .from('courses')
          .update({
            metadata: { chapters: [] },
            updated_at: new Date().toISOString()
          })
          .eq('id', course.id)
      ) || [];

      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
      }
    }

    // 更新後のコースを取得
    const { data: updatedCourses, error: updateError } = await supabase
      .from('courses')
      .select('id, title, metadata, order_index');

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Metadata setup completed',
      hasMetadataColumn,
      coursesUpdated: updatedCourses?.length || 0,
      courses: updatedCourses
    });

  } catch (error) {
    console.error('Setup metadata error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Please run this SQL in Supabase:',
      sql: `ALTER TABLE courses ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{"chapters": []}'::jsonb;`
    }, { status: 500 });
  }
}