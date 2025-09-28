import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

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

    // SQLを実行してmetadataカラムを追加
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: `
        ALTER TABLE courses
        ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{"chapters": []}'::jsonb;
      `
    }).single();

    if (error) {
      console.error('Error adding metadata column:', error);

      // rpc関数が存在しない場合は、直接SQLを実行できないので別の方法を試す
      if (error.message.includes('function') || error.message.includes('does not exist')) {
        // 既存のコースを更新してmetadataフィールドを追加
        const { data: courses, error: fetchError } = await supabase
          .from('courses')
          .select('id');

        if (fetchError) {
          return NextResponse.json({
            error: fetchError.message,
            message: 'Failed to fetch courses'
          }, { status: 500 });
        }

        // 各コースにmetadataを追加（もし存在しない場合）
        const updatePromises = courses?.map(course =>
          supabase
            .from('courses')
            .update({ metadata: { chapters: [] } })
            .eq('id', course.id)
            .is('metadata', null)
        ) || [];

        const results = await Promise.all(updatePromises);
        const errors = results.filter(r => r.error).map(r => r.error);

        if (errors.length > 0) {
          console.error('Errors updating courses:', errors);
          return NextResponse.json({
            warning: 'Some courses could not be updated',
            errors: errors.map(e => e?.message),
            updated: results.filter(r => !r.error).length,
            message: 'Partial update completed. You may need to add the metadata column manually in Supabase.'
          });
        }

        return NextResponse.json({
          success: true,
          message: 'Metadata field updated for all courses',
          updated: results.length
        });
      }

      return NextResponse.json({
        error: error.message,
        message: 'Failed to add metadata column. You may need to run the SQL manually in Supabase.',
        sql: `ALTER TABLE courses ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{"chapters": []}'::jsonb;`
      }, { status: 500 });
    }

    // 既存のコースにデフォルト値を設定
    const { error: updateError } = await supabase
      .from('courses')
      .update({ metadata: { chapters: [] } })
      .is('metadata', null);

    if (updateError) {
      console.log('Warning: Could not update existing courses:', updateError);
    }

    return NextResponse.json({
      success: true,
      message: 'Metadata column added successfully',
      data
    });

  } catch (error) {
    console.error('Error in add-metadata-column:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'You may need to run this SQL manually in Supabase:',
      sql: `ALTER TABLE courses ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{"chapters": []}'::jsonb;`
    }, { status: 500 });
  }
}