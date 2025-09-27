import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);
    const adminSupabase = createAdminSupabaseClient();

    // 認証チェック
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 管理者権限チェック
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (!userProfile || userProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Admin permission required' }, { status: 403 });
    }

    // チャプターテーブルが存在するか確認
    const { data: existingChapters, error: checkError } = await adminSupabase
      .from('chapters')
      .select('id')
      .limit(1);

    if (checkError) {
      // テーブルが存在しない場合のエラーメッセージ
      if (checkError.message.includes('relation') && checkError.message.includes('does not exist')) {
        return NextResponse.json({
          error: 'Chapters table does not exist',
          message: 'Please create the chapters table in Supabase dashboard with the following structure:',
          structure: {
            id: 'uuid (primary key, default: gen_random_uuid())',
            course_id: 'integer (foreign key to courses.id)',
            title: 'text',
            display_order: 'integer (default: 0)',
            created_at: 'timestamptz (default: now())',
            updated_at: 'timestamptz (default: now())'
          },
          note: 'Also add chapter_id column to videos table as: uuid (foreign key to chapters.id, nullable)'
        }, { status: 400 });
      }

      // その他のエラー
      console.error('Error checking chapters table:', checkError);
      return NextResponse.json(
        { error: 'Failed to check chapters table', details: checkError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Chapters table created successfully'
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}