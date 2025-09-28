import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const difficulty = searchParams.get('difficulty');
    const status = searchParams.get('status') || 'active';
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('courses')
      .select(`
        id,
        title,
        description,
        thumbnail_url,
        category,
        difficulty_level,
        estimated_duration,
        completion_threshold,
        order_index,
        status,
        created_at,
        videos!inner(count)
      `)
      .eq('status', status)
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (category) {
      query = query.eq('category', category);
    }

    if (difficulty) {
      query = query.eq('difficulty_level', difficulty);
    }

    const { data: courses, error } = await query;

    if (error) {
      console.error('Error fetching courses:', error);
      return NextResponse.json({ error: 'コース情報の取得に失敗しました' }, { status: 500 });
    }

    // ユーザーの受講状況を取得
    const courseIds = courses.map(course => course.id);
    let userProgress = [];

    if (courseIds.length > 0) {
      const { data: progressData } = await supabase
        .from('user_courses')
        .select('course_id, status, assigned_at')
        .eq('user_id', user.id)
        .in('course_id', courseIds);

      userProgress = progressData || [];
    }

    // コースに進捗情報を追加
    const coursesWithProgress = courses.map(course => {
      const progress = userProgress.find(p => p.course_id === course.id);
      return {
        ...course,
        user_enrollment: progress ? {
          status: progress.status,
          assigned_at: progress.assigned_at
        } : null,
        video_count: course.videos?.[0]?.count || 0
      };
    });

    return NextResponse.json({
      courses: coursesWithProgress,
      pagination: {
        offset,
        limit,
        has_more: courses.length === limit
      }
    });
  } catch (error) {
    console.error('Error in GET /api/courses:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 講師または管理者権限チェック
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || !['instructor', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: '講師または管理者権限が必要です' }, { status: 403 });
    }

    const body = await request.json();
    const {
      title,
      description,
      thumbnail_url,
      category,
      difficulty_level,
      estimated_duration,
      completion_threshold = 95,
      order_index = 0
    } = body;

    if (!title) {
      return NextResponse.json({ error: 'コースタイトルは必須です' }, { status: 400 });
    }

    // コースを作成
    const { data: course, error } = await supabase
      .from('courses')
      .insert({
        title,
        description,
        thumbnail_url,
        category,
        difficulty_level,
        estimated_duration,
        completion_threshold,
        order_index,
        created_by: user.id,
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating course:', error);
      return NextResponse.json({ error: 'コースの作成に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'コースが作成されました',
      course: course
    });
  } catch (error) {
    console.error('Error in POST /api/courses:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}