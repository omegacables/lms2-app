import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabaseクライアントの作成
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const targetUserId = params.id;
    
    // Service Role Keyを使用してSupabase Adminクライアントを作成
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // リクエストを送信したユーザーの権限を確認
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // トークンから現在のユーザーを取得
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 管理者権限を確認
    const { data: currentUser, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    // 自分自身は削除できない
    if (targetUserId === user.id) {
      return NextResponse.json({ error: '自分自身は削除できません' }, { status: 400 });
    }

    console.log(`Starting deletion process for user: ${targetUserId}`);

    // 1. 関連データを削除（CASCADE設定があるものも念のため明示的に削除）
    const deletionSteps = [
      { table: 'video_view_logs', column: 'user_id' },
      { table: 'user_courses', column: 'user_id' },
      { table: 'user_courses', column: 'assigned_by' },
      { table: 'course_completions', column: 'user_id' },
      { table: 'certificates', column: 'user_id' },
      { table: 'support_conversations', column: 'student_id' },
      { table: 'support_messages', column: 'sender_id' },
      { table: 'notifications', column: 'user_id' },
      { table: 'system_logs', column: 'user_id' },
    ];

    // 各テーブルから削除
    for (const step of deletionSteps) {
      try {
        const { error } = await supabaseAdmin
          .from(step.table)
          .delete()
          .eq(step.column, targetUserId);
        
        if (error) {
          console.error(`Error deleting from ${step.table}:`, error);
        } else {
          console.log(`Successfully deleted from ${step.table}`);
        }
      } catch (e) {
        console.error(`Table ${step.table} might not exist:`, e);
      }
    }

    // 2. 外部キーをNULLに更新
    const updateSteps = [
      { table: 'system_settings', column: 'updated_by' },
      { table: 'courses', column: 'created_by' },
      { table: 'announcements', column: 'created_by' },
    ];

    for (const step of updateSteps) {
      try {
        const { error } = await supabaseAdmin
          .from(step.table)
          .update({ [step.column]: null })
          .eq(step.column, targetUserId);
        
        if (error) {
          console.error(`Error updating ${step.table}:`, error);
        } else {
          console.log(`Successfully updated ${step.table}`);
        }
      } catch (e) {
        console.error(`Table ${step.table} might not exist:`, e);
      }
    }

    // 3. messagesテーブルの処理
    try {
      const { error } = await supabaseAdmin
        .from('messages')
        .delete()
        .or(`sender_id.eq.${targetUserId},receiver_id.eq.${targetUserId}`);
      
      if (error) {
        console.error('Error deleting messages:', error);
      }
    } catch (e) {
      console.error('Messages table might not exist:', e);
    }

    // 4. user_profilesから削除
    const { error: profileDeleteError } = await supabaseAdmin
      .from('user_profiles')
      .delete()
      .eq('id', targetUserId);

    if (profileDeleteError) {
      console.error('Error deleting user profile:', profileDeleteError);
      // プロフィール削除に失敗してもAuth削除を試みる
    } else {
      console.log('Successfully deleted user profile');
    }

    // 5. auth.usersから削除（最も重要）
    try {
      const { data: deleteData, error: authError } = await supabaseAdmin.auth.admin.deleteUser(
        targetUserId
      );
      
      if (authError) {
        console.error('Error deleting from auth.users:', authError);
        
        // エラーの詳細を確認
        if (authError.message?.includes('User not found')) {
          // ユーザーが既に存在しない場合は成功として扱う
          return NextResponse.json({ 
            success: true,
            message: 'ユーザーデータは削除されました（認証ユーザーは既に存在しません）'
          });
        }
        
        return NextResponse.json({ 
          error: '認証ユーザーの削除に失敗しました',
          details: authError.message,
          hint: 'Supabaseダッシュボードから手動で削除してください'
        }, { status: 500 });
      }
      
      console.log('Successfully deleted auth user:', deleteData);
    } catch (e) {
      console.error('Critical error deleting auth user:', e);
      return NextResponse.json({ 
        error: '認証ユーザーの削除中にエラーが発生しました',
        details: e instanceof Error ? e.message : 'Unknown error'
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      message: 'ユーザーが正常に削除されました'
    });

  } catch (error) {
    console.error('User deletion error:', error);
    return NextResponse.json({ 
      error: 'ユーザーの削除に失敗しました',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}