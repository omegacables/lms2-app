import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    let supabase = createServerSupabaseClient(cookieStore);

    // Authorizationヘッダーからトークンを取得
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // トークンを使用してSupabaseクライアントを作成
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const { createClient } = await import('@supabase/supabase-js');
      supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      });
    }

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const difficulty = searchParams.get('difficulty');
    const status = searchParams.get('status') || 'active';
    const limit = parseInt(searchParams.get('limit') || '1000');
    const offset = parseInt(searchParams.get('offset') || '0');
    const isAdmin = searchParams.get('admin') === 'true';

    // 管理者権限チェック（adminパラメータが指定されている場合）
    if (isAdmin) {
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!userProfile || !['instructor', 'admin'].includes(userProfile.role)) {
        return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
      }
    }

    // 管理者の場合はRLSをバイパスしてすべてのコースを取得
    const queryClient = isAdmin ? createAdminSupabaseClient() : supabase;

    let query = queryClient
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
        created_by,
        updated_at
      `)
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // 管理者でない場合はactiveのコースのみ表示
    if (!isAdmin) {
      query = query.eq('status', 'active');
    } else if (status !== 'all') {
      // 管理者の場合でもstatusフィルタが指定されている場合は適用
      query = query.eq('status', status);
    }

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

    // コースIDのリストを作成
    const courseIds = courses.map(course => course.id);

    // 動画統計情報を取得（管理者の場合は非公開動画も含む）
    let videoStats = new Map();
    if (courseIds.length > 0) {
      const { data: videos } = await queryClient
        .from('videos')
        .select('course_id, duration')
        .in('course_id', courseIds);

      videos?.forEach(video => {
        const stats = videoStats.get(video.course_id) || { count: 0, duration: 0 };
        stats.count++;
        stats.duration += video.duration || 0;
        videoStats.set(video.course_id, stats);
      });
    }

    // ユーザーの受講状況を取得（管理者でない場合のみ）
    let userProgress = [];
    if (!isAdmin && courseIds.length > 0) {
      const { data: progressData } = await supabase
        .from('user_courses')
        .select('course_id, status, assigned_at')
        .eq('user_id', user.id)
        .in('course_id', courseIds);

      userProgress = progressData || [];
    }

    // 受講者数を取得（管理者の場合）
    let enrollmentStats = new Map();
    if (isAdmin && courseIds.length > 0) {
      const { data: enrollments } = await queryClient
        .from('course_enrollments')
        .select('course_id')
        .in('course_id', courseIds);

      enrollments?.forEach(enrollment => {
        const count = enrollmentStats.get(enrollment.course_id) || 0;
        enrollmentStats.set(enrollment.course_id, count + 1);
      });
    }

    // コースに統計情報を追加
    const coursesWithStats = courses.map(course => {
      const videoStat = videoStats.get(course.id) || { count: 0, duration: 0 };
      const totalDuration = course.estimated_duration || videoStat.duration;

      const result: any = {
        ...course,
        video_count: videoStat.count,
        total_duration: totalDuration,
      };

      // 管理者の場合は受講者数を追加
      if (isAdmin) {
        result.enrollment_count = enrollmentStats.get(course.id) || 0;
      } else {
        // 一般ユーザーの場合は受講状況を追加
        const progress = userProgress.find(p => p.course_id === course.id);
        result.user_enrollment = progress ? {
          status: progress.status,
          assigned_at: progress.assigned_at
        } : null;
      }

      return result;
    });

    return NextResponse.json({
      courses: coursesWithStats,
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