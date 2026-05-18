import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * 会社単位での一括ユーザー削除。
 * - 会社の全ユーザーを auth.users / user_profiles から削除
 * - 関連レコード (video_view_logs / user_courses / certificates etc.) も削除
 * - labor_consultant_companies の該当会社マッピングも削除
 * - 呼び出し元 admin 自身は対象から除外（誤って自分を消さないように）
 */
export async function POST(request: NextRequest) {
  try {
    // 🛡 管理者権限を必須化
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const { company } = await request.json().catch(() => ({}));

    if (!company || typeof company !== 'string' || !company.trim()) {
      return NextResponse.json(
        { error: '会社名が指定されていません' },
        { status: 400 }
      );
    }

    const companyName = company.trim();

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. 該当会社のユーザー一覧を取得（自分自身は除外）
    const { data: usersInCompany, error: listError } = await adminClient
      .from('user_profiles')
      .select('id, display_name')
      .eq('company', companyName);

    if (listError) {
      console.error('[Company Delete] List error:', listError);
      return NextResponse.json(
        { error: `対象ユーザーの取得に失敗しました: ${listError.message}` },
        { status: 500 }
      );
    }

    const targetUsers = (usersInCompany ?? []).filter(u => u.id !== auth.user.id);

    if (targetUsers.length === 0) {
      // 該当ユーザー無し、または自分しかいない → labor_consultant_companies の掃除だけ実行
      const { error: lccError } = await adminClient
        .from('labor_consultant_companies')
        .delete()
        .eq('company', companyName);
      if (lccError) {
        console.warn('[Company Delete] labor_consultant_companies cleanup warning:', lccError.message);
      }
      return NextResponse.json({
        success: true,
        deletedUsers: 0,
        message: '削除対象のユーザーはいませんでした（社労士の担当会社マッピングはクリアしました）',
      });
    }

    const targetIds = targetUsers.map(u => u.id);

    // 2. 関連テーブルから一括削除（テーブルが存在しないものはエラーを無視）
    const deletionTasks: { table: string; column: string }[] = [
      { table: 'video_view_logs', column: 'user_id' },
      { table: 'user_courses', column: 'user_id' },
      { table: 'user_courses', column: 'assigned_by' },
      { table: 'course_completions', column: 'user_id' },
      { table: 'certificates', column: 'user_id' },
      { table: 'support_messages', column: 'sender_id' },
      { table: 'support_conversations', column: 'student_id' },
      { table: 'notifications', column: 'user_id' },
      { table: 'system_logs', column: 'user_id' },
    ];

    for (const task of deletionTasks) {
      try {
        const { error } = await adminClient
          .from(task.table)
          .delete()
          .in(task.column, targetIds);
        if (error) {
          console.warn(`[Company Delete] ${task.table}.${task.column} cleanup warning:`, error.message);
        }
      } catch (e) {
        console.warn(`[Company Delete] ${task.table} skipped:`, e);
      }
    }

    // 3. messages の sender_id / receiver_id を削除（OR フィルタ）
    try {
      const orFilter = targetIds
        .flatMap(id => [`sender_id.eq.${id}`, `receiver_id.eq.${id}`])
        .join(',');
      await adminClient.from('messages').delete().or(orFilter);
    } catch (e) {
      console.warn('[Company Delete] messages cleanup skipped:', e);
    }

    // 4. 外部キー (NULL に更新) - courses.created_by, announcements.created_by など
    const nullifyTasks: { table: string; column: string }[] = [
      { table: 'courses', column: 'created_by' },
      { table: 'announcements', column: 'created_by' },
      { table: 'system_settings', column: 'updated_by' },
    ];
    for (const task of nullifyTasks) {
      try {
        await adminClient
          .from(task.table)
          .update({ [task.column]: null })
          .in(task.column, targetIds);
      } catch (e) {
        console.warn(`[Company Delete] nullify ${task.table}.${task.column} skipped:`, e);
      }
    }

    // 5. user_profiles から削除
    const { error: profileDeleteError } = await adminClient
      .from('user_profiles')
      .delete()
      .in('id', targetIds);

    if (profileDeleteError) {
      console.error('[Company Delete] Profile delete error:', profileDeleteError);
    }

    // 6. auth.users から削除（並列実行）
    const authResults = await Promise.allSettled(
      targetIds.map(id => adminClient.auth.admin.deleteUser(id))
    );

    let authDeleted = 0;
    const authFailures: { id: string; reason: string }[] = [];
    authResults.forEach((result, idx) => {
      if (result.status === 'fulfilled' && !result.value.error) {
        authDeleted++;
      } else {
        const reason =
          result.status === 'fulfilled'
            ? result.value.error?.message ?? 'unknown'
            : String(result.reason);
        authFailures.push({ id: targetIds[idx], reason });
      }
    });

    // 7. labor_consultant_companies の該当会社マッピングを削除
    try {
      await adminClient
        .from('labor_consultant_companies')
        .delete()
        .eq('company', companyName);
    } catch (e) {
      console.warn('[Company Delete] labor_consultant_companies cleanup skipped:', e);
    }

    return NextResponse.json({
      success: true,
      company: companyName,
      deletedUsers: authDeleted,
      requested: targetIds.length,
      failures: authFailures,
      message:
        authFailures.length === 0
          ? `${companyName} の ${authDeleted}名 を削除しました`
          : `${authDeleted}名 を削除しました（${authFailures.length}名 で失敗）`,
    });
  } catch (error) {
    console.error('[Company Delete] Unexpected error:', error);
    return NextResponse.json(
      {
        error: '会社削除中にエラーが発生しました',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
