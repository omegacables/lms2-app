import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      db: {
        schema: 'public'
      }
    });

    // SQLクエリを直接実行する別の方法
    // Supabaseの管理APIを使用してテーブルを作成
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS public.user_courses (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        course_id INTEGER NOT NULL,
        assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        assigned_by UUID,
        due_date TIMESTAMP WITH TIME ZONE,
        status VARCHAR(20) DEFAULT 'assigned',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    // まず、シンプルな方法でテーブルが存在するか確認
    const { data: tables, error: tableError } = await supabase
      .from('user_courses')
      .select('*')
      .limit(1);

    if (tableError && tableError.code === '42P01') {
      // テーブルが存在しない場合
      return NextResponse.json({
        success: false,
        error: 'Table does not exist',
        message: 'Please create the user_courses table in Supabase Dashboard',
        sql: createTableSQL,
        instructions: [
          '1. Go to https://supabase.com/dashboard',
          '2. Select your project',
          '3. Navigate to SQL Editor',
          '4. Copy and paste the following SQL:',
          createTableSQL,
          '5. Click "Run" to execute the SQL'
        ]
      });
    }

    // テーブルが存在する場合、テストデータを挿入
    const { data: user } = await supabase
      .from('user_profiles')
      .select('id')
      .like('display_name', '%安藤%')
      .single();

    const { data: course } = await supabase
      .from('courses')
      .select('id')
      .eq('status', 'active')
      .limit(1)
      .single();

    if (user && course) {
      // 既存の割り当てを確認
      const { data: existing } = await supabase
        .from('user_courses')
        .select('*')
        .eq('user_id', user.id)
        .eq('course_id', course.id)
        .single();

      if (!existing) {
        const { data: newAssignment, error: insertError } = await supabase
          .from('user_courses')
          .insert({
            user_id: user.id,
            course_id: course.id,
            status: 'assigned'
          })
          .select()
          .single();

        if (insertError) {
          return NextResponse.json({
            success: false,
            error: insertError.message,
            details: insertError
          });
        }

        return NextResponse.json({
          success: true,
          message: 'Test assignment created successfully',
          data: newAssignment
        });
      } else {
        return NextResponse.json({
          success: true,
          message: 'Assignment already exists',
          data: existing
        });
      }
    } else {
      return NextResponse.json({
        success: false,
        error: 'User or course not found',
        user: user,
        course: course
      });
    }

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}