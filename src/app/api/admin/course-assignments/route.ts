import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/database/supabase';

export async function GET(request: NextRequest) {
  try {
    // URLパラメータから user_id を取得
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('user_id');

    if (userId) {
      // 特定ユーザーの割り当てられたコースを取得
      const { data, error } = await supabase
        .from('user_course_assignments')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      return NextResponse.json({ data });
    } else {
      // すべての割り当てを取得
      const { data, error } = await supabase
        .from('user_course_assignments')
        .select('*');

      if (error) throw error;

      return NextResponse.json({ data });
    }
  } catch (error) {
    console.error('コース割り当て取得エラー:', error);
    return NextResponse.json(
      { error: 'コース割り当ての取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, course_id } = body;

    if (!user_id || !course_id) {
      return NextResponse.json(
        { error: 'ユーザーIDとコースIDが必要です' },
        { status: 400 }
      );
    }

    // 既存の割り当てをチェック
    const { data: existing } = await supabase
      .from('user_course_assignments')
      .select('*')
      .eq('user_id', user_id)
      .eq('course_id', course_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { message: '既にコースが割り当てられています' },
        { status: 200 }
      );
    }

    // コースを割り当て
    const { data, error } = await supabase
      .from('user_course_assignments')
      .insert({
        user_id,
        course_id,
        assigned_at: new Date().toISOString(),
        assigned_by: body.assigned_by || null
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('コース割り当てエラー:', error);
    return NextResponse.json(
      { error: 'コースの割り当てに失敗しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('user_id');
    const courseId = searchParams.get('course_id');

    if (!userId || !courseId) {
      return NextResponse.json(
        { error: 'ユーザーIDとコースIDが必要です' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('user_course_assignments')
      .delete()
      .eq('user_id', userId)
      .eq('course_id', courseId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('コース割り当て削除エラー:', error);
    return NextResponse.json(
      { error: 'コース割り当ての削除に失敗しました' },
      { status: 500 }
    );
  }
}