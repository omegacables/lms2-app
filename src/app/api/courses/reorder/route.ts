import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    const { courses } = await request.json();

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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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