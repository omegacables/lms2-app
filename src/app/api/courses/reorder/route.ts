import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // セッションチェック
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      console.error('Session error:', sessionError);
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const user = session.user;

    // 管理者権限チェック
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || !['admin', 'instructor'].includes(userProfile.role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { courses } = await request.json();

    if (!courses || !Array.isArray(courses)) {
      return NextResponse.json(
        { error: 'Invalid courses data' },
        { status: 400 }
      );
    }

    // トランザクションのように、すべての更新を実行
    for (const course of courses) {
      const { error: updateError } = await supabase
        .from('courses')
        .update({
          order_index: course.order_index,
          updated_at: new Date().toISOString()
        })
        .eq('id', course.id);

      if (updateError) {
        console.error(`Error updating course ${course.id}:`, updateError);
        return NextResponse.json(
          { error: `Failed to update course order for course ${course.id}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully updated order for ${courses.length} courses`
    });
  } catch (error) {
    console.error('Error reordering courses:', error);
    return NextResponse.json(
      { error: 'Failed to reorder courses' },
      { status: 500 }
    );
  }
}