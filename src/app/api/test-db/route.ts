import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    // 環境変数を直接使用
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json({
        success: false,
        error: 'Missing environment variables',
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!supabaseServiceRoleKey
      });
    }
    
    // Service Role Keyでクライアントを作成
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    // user_coursesテーブルから1件取得
    const { data: userCourses, error: userCoursesError } = await supabase
      .from('user_courses')
      .select('*')
      .limit(5);
    
    // user_profilesから安藤蓮を検索
    const { data: users, error: usersError } = await supabase
      .from('user_profiles')
      .select('id, display_name, company')
      .like('display_name', '%安藤%')
      .limit(1);
    
    // coursesテーブルから取得
    const { data: courses, error: coursesError } = await supabase
      .from('courses')
      .select('id, title')
      .limit(5);
    
    return NextResponse.json({
      success: true,
      userCourses: {
        data: userCourses,
        error: userCoursesError?.message,
        count: userCourses?.length || 0
      },
      users: {
        data: users,
        error: usersError?.message,
        count: users?.length || 0
      },
      courses: {
        data: courses,
        error: coursesError?.message,
        count: courses?.length || 0
      }
    });
    
  } catch (error) {
    console.error('Test DB error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
      stack: (error as Error).stack
    });
  }
}

// コース割り当てをテスト
export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json({
        success: false,
        error: 'Missing environment variables'
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    // 安藤蓮のIDを取得
    const { data: user } = await supabase
      .from('user_profiles')
      .select('id')
      .like('display_name', '%安藤%')
      .single();
    
    if (!user) {
      return NextResponse.json({
        success: false,
        error: '安藤蓮が見つかりません'
      });
    }
    
    // 最初のアクティブなコースを取得
    const { data: course } = await supabase
      .from('courses')
      .select('id')
      .eq('status', 'active')
      .limit(1)
      .single();
    
    if (!course) {
      return NextResponse.json({
        success: false,
        error: 'アクティブなコースが見つかりません'
      });
    }
    
    // 既存の割り当てを確認
    const { data: existing } = await supabase
      .from('user_courses')
      .select('id')
      .eq('user_id', user.id)
      .eq('course_id', course.id)
      .single();
    
    if (existing) {
      return NextResponse.json({
        success: false,
        error: 'このコースは既に割り当てられています',
        existing: existing
      });
    }
    
    // コースを割り当て
    const { data, error } = await supabase
      .from('user_courses')
      .insert({
        user_id: user.id,
        course_id: course.id,
        status: 'assigned',
        assigned_at: new Date().toISOString()
      })
      .select();
    
    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message,
        details: error
      });
    }
    
    return NextResponse.json({
      success: true,
      message: 'コースを割り当てました',
      data: data
    });
    
  } catch (error) {
    console.error('Test assign error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}