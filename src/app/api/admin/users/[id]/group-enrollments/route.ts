import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

// ユーザーに割り当てられたグループ一覧を取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
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

    if (!userProfile || !['instructor', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const adminSupabase = createAdminSupabaseClient();

    // ユーザーのグループ登録を取得（グループ情報とアンロック状態を含む）
    const { data: enrollments, error } = await adminSupabase
      .from('user_group_enrollments')
      .select(`
        *,
        group:course_groups(
          id,
          title,
          description,
          is_sequential,
          items:course_group_items(
            id,
            course_id,
            order_index,
            course:courses(*)
          )
        ),
        enrolled_by_user:user_profiles!enrolled_by(display_name)
      `)
      .eq('user_id', userId)
      .order('enrolled_at', { ascending: false });

    if (error) {
      console.error('Error fetching enrollments:', error);
      return NextResponse.json({ error: 'グループ登録の取得に失敗しました' }, { status: 500 });
    }

    // 各グループのアンロック状態を計算
    const enrichedEnrollments = await Promise.all((enrollments || []).map(async (enrollment: any) => {
      const group = enrollment.group;
      if (!group || !group.items) {
        return enrollment;
      }

      // グループ内のコースを order_index でソート
      const sortedItems = [...group.items].sort((a, b) => a.order_index - b.order_index);

      // 各コースの進捗とアンロック状態を取得
      const coursesWithStatus = await Promise.all(sortedItems.map(async (item: any, index: number) => {
        // コースの進捗を取得
        const { data: progress } = await adminSupabase
          .from('course_assignments')
          .select('progress, status')
          .eq('user_id', userId)
          .eq('course_id', item.course_id)
          .single();

        const currentProgress = progress?.progress || 0;
        const isCompleted = currentProgress >= 90;

        // アンロック状態を判定
        let isUnlocked = false;
        if (!group.is_sequential) {
          // 自由受講モード：すべてアンロック
          isUnlocked = true;
        } else {
          // 順次アンロックモード
          if (index === 0) {
            // 最初のコースは常にアンロック
            isUnlocked = true;
          } else {
            // 前のコースが完了していればアンロック
            const previousItem = sortedItems[index - 1];
            const { data: prevProgress } = await adminSupabase
              .from('course_assignments')
              .select('progress')
              .eq('user_id', userId)
              .eq('course_id', previousItem.course_id)
              .single();

            isUnlocked = (prevProgress?.progress || 0) >= 90;
          }
        }

        return {
          ...item,
          progress: currentProgress,
          isCompleted,
          isUnlocked,
          assignmentStatus: progress?.status || 'not_started'
        };
      }));

      return {
        ...enrollment,
        group: {
          ...group,
          items: coursesWithStatus
        }
      };
    }));

    return NextResponse.json({
      success: true,
      data: enrichedEnrollments
    });

  } catch (error) {
    console.error('Error in GET /api/admin/users/[id]/group-enrollments:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

// ユーザーにグループを割り当て
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
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

    if (!userProfile || !['instructor', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const body = await request.json();
    const { groupIds } = body;

    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      return NextResponse.json({ error: 'グループIDが必要です' }, { status: 400 });
    }

    const adminSupabase = createAdminSupabaseClient();

    // グループを割り当て（重複は無視）
    const enrollments = groupIds.map(groupId => ({
      user_id: userId,
      group_id: groupId,
      enrolled_by: user.id,
      enrolled_at: new Date().toISOString()
    }));

    const { data, error } = await adminSupabase
      .from('user_group_enrollments')
      .upsert(enrollments, { onConflict: 'user_id,group_id', ignoreDuplicates: true })
      .select();

    if (error) {
      console.error('Error enrolling groups:', error);
      return NextResponse.json({ error: 'グループ割り当てに失敗しました' }, { status: 500 });
    }

    // 自動的にグループ内のコースを course_assignments にも追加
    for (const groupId of groupIds) {
      const { data: groupItems } = await adminSupabase
        .from('course_group_items')
        .select('course_id')
        .eq('group_id', groupId);

      if (groupItems && groupItems.length > 0) {
        const assignments = groupItems.map(item => ({
          user_id: userId,
          course_id: item.course_id,
          assigned_by: user.id,
          assigned_at: new Date().toISOString(),
          status: 'not_started'
        }));

        await adminSupabase
          .from('course_assignments')
          .upsert(assignments, { onConflict: 'user_id,course_id', ignoreDuplicates: true });
      }
    }

    return NextResponse.json({
      success: true,
      enrolled: data?.length || 0,
      message: `${data?.length || 0}件のグループを割り当てました`
    });

  } catch (error) {
    console.error('Error in POST /api/admin/users/[id]/group-enrollments:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

// グループ割り当てを解除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
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

    if (!userProfile || !['instructor', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const body = await request.json();
    const { groupId } = body;

    if (!groupId) {
      return NextResponse.json({ error: 'グループIDが必要です' }, { status: 400 });
    }

    const adminSupabase = createAdminSupabaseClient();

    // グループ割り当てを削除
    const { error } = await adminSupabase
      .from('user_group_enrollments')
      .delete()
      .eq('user_id', userId)
      .eq('group_id', groupId);

    if (error) {
      console.error('Error removing enrollment:', error);
      return NextResponse.json({ error: 'グループ解除に失敗しました' }, { status: 500 });
    }

    // 注意: course_assignmentsは削除しない（既存の視聴履歴を保護）

    return NextResponse.json({
      success: true,
      message: 'グループ割り当てを解除しました'
    });

  } catch (error) {
    console.error('Error in DELETE /api/admin/users/[id]/group-enrollments:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
