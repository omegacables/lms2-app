import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/database/supabase';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function PUT(request: NextRequest) {
  try {
    console.log('[Reorder API] Request received');

    // Authorizationヘッダーからトークンを取得
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    console.log('[Reorder API] Has token:', !!token);

    let supabase;
    let user;
    let authError;

    if (token) {
      // トークンがある場合は、そのトークンを使用してSupabaseクライアントを作成
      supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        }
      );

      const { data, error } = await supabase.auth.getUser();
      user = data.user;
      authError = error;
      console.log('[Reorder API] Auth via token:', { hasUser: !!user, userId: user?.id, error: error?.message });
    } else {
      // トークンがない場合はクッキーから認証
      const cookieStore = await cookies();
      supabase = createServerSupabaseClient(cookieStore);

      const { data, error } = await supabase.auth.getUser();
      user = data.user;
      authError = error;
      console.log('[Reorder API] Auth via cookie:', { hasUser: !!user, userId: user?.id, error: error?.message });
    }

    if (authError || !user) {
      console.error('[Reorder API] Auth error:', authError);
      return NextResponse.json({
        error: '認証が必要です',
        debug: process.env.NODE_ENV === 'development' ? {
          authError: authError?.message,
          hasToken: !!token
        } : undefined
      }, { status: 401 });
    }

    // 管理者権限チェック
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    console.log('[Reorder API] User profile:', {
      userId: user.id,
      hasProfile: !!userProfile,
      role: userProfile?.role,
      profileError: profileError?.message
    });

    if (!userProfile || !['admin', 'instructor'].includes(userProfile.role)) {
      return NextResponse.json({
        error: '権限がありません',
        debug: process.env.NODE_ENV === 'development' ? {
          hasProfile: !!userProfile,
          role: userProfile?.role,
          allowedRoles: ['admin', 'instructor']
        } : undefined
      }, { status: 403 });
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