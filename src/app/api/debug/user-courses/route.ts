import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    // 環境変数を直接使用
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('Missing Supabase environment variables');
      return NextResponse.json(
        { 
          success: false, 
          error: 'Configuration error',
          details: {
            hasUrl: !!supabaseUrl,
            hasServiceKey: !!supabaseServiceRoleKey
          }
        },
        { status: 500 }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    // user_coursesテーブルの全データを取得
    const { data: userCourses, error: userCoursesError } = await supabase
      .from('user_courses')
      .select('*')
      .order('created_at', { ascending: false });

    if (userCoursesError) {
      console.error('user_courses error:', userCoursesError);
    }

    // user_profilesから安藤蓮のIDを取得
    const { data: users, error: usersError } = await supabase
      .from('user_profiles')
      .select('id, display_name, company')
      .like('display_name', '%安藤%');

    if (usersError) {
      console.error('users error:', usersError);
    }

    // coursesテーブルのデータを取得
    const { data: courses, error: coursesError } = await supabase
      .from('courses')
      .select('id, title, status');

    if (coursesError) {
      console.error('courses error:', coursesError);
    }

    // 安藤蓮のコース割り当てを確認
    let andoAssignments = null;
    if (users && users.length > 0) {
      const andoId = users[0].id;
      const { data: assignments } = await supabase
        .from('user_courses')
        .select(`
          *,
          courses (
            id,
            title,
            description
          )
        `)
        .eq('user_id', andoId);
      
      andoAssignments = assignments;
    }

    return NextResponse.json({
      success: true,
      data: {
        userCourses: userCourses || [],
        userCoursesCount: userCourses?.length || 0,
        users: users || [],
        courses: courses || [],
        andoAssignments: andoAssignments || [],
        andoInfo: users && users.length > 0 ? users[0] : null
      }
    });

  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: (error as Error).message 
      },
      { status: 500 }
    );
  }
}