import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export async function PUT(request: NextRequest) {
  try {
    const { supabase, error, status } = await createAdminClient();

    if (error || !supabase) {
      return NextResponse.json({ error }, { status: status || 401 });
    }

    const { courses } = await request.json();

    // 各コースのorder_indexを更新
    const updatePromises = courses.map((course: any) =>
      supabase
        .from('courses')
        .update({
          order_index: course.order_index,
          updated_at: new Date().toISOString()
        })
        .eq('id', course.id)
    );

    const results = await Promise.all(updatePromises);

    // エラーチェック
    const hasError = results.some(result => result.error);
    if (hasError) {
      const errors = results.filter(r => r.error).map(r => r.error);
      console.error('Errors updating course order:', errors);
      return NextResponse.json(
        { error: 'Failed to update course order' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reordering courses:', error);
    return NextResponse.json(
      { error: 'Failed to reorder courses' },
      { status: 500 }
    );
  }
}