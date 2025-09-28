import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 管理者権限チェック
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || userProfile.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const body = await request.json();
    const { courses } = body; // [{id, display_order}]

    if (!Array.isArray(courses)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // 各コースの表示順を更新
    const updates = await Promise.all(
      courses.map(course =>
        supabase
          .from('courses')
          .update({
            display_order: course.display_order,
            updated_at: new Date().toISOString()
          })
          .eq('id', course.id)
      )
    );

    const hasError = updates.some(result => result.error);
    if (hasError) {
      const errors = updates
        .filter(result => result.error)
        .map(result => result.error?.message);

      return NextResponse.json(
        { error: 'Some updates failed', details: errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Course order updated successfully'
    });

  } catch (error) {
    console.error('Error updating course order:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}