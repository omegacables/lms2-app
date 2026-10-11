import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/getUser';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // 以前は body の userId を信用して無認証で既読にしていた。呼び出し元を認証し、本人の ID だけを使う
    const { user, response } = await getAuthUser(request, body.access_token);
    if (!user) return response!;
    const userId = user.id;
    const { conversationId } = body;
    const supabase = createAdminSupabaseClient();

    if (!conversationId) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameters'
      }, { status: 400 });
    }

    console.log(`APIで既読処理: conversationId=${conversationId}, userId=${userId}`);

    // まず会話の所有者を確認
    const { data: conversation } = await supabase
      .from('support_conversations')
      .select('student_id')
      .eq('id', conversationId)
      .single();

    if (!conversation || conversation.student_id !== userId) {
      return NextResponse.json({
        success: false,
        error: '権限がありません'
      }, { status: 403 });
    }

    // 管理者からの未読メッセージを取得（自分以外が送信した未読 = 相手から来たもの）
    const { data: unreadMessages } = await supabase
      .from('support_messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .neq('sender_id', userId)
      .eq('is_read', false);

    if (!unreadMessages || unreadMessages.length === 0) {
      console.log('未読メッセージなし');
      return NextResponse.json({
        success: true,
        message: '未読メッセージはありません',
        updatedCount: 0
      });
    }

    console.log(`${unreadMessages.length}件の未読メッセージを既読に更新`);

    // すべての未読メッセージを既読に更新
    const messageIds = unreadMessages.map(msg => msg.id);
    const { data: updated, error: updateError } = await supabase
      .from('support_messages')
      .update({
        is_read: true,
      })
      .in('id', messageIds)
      .select();

    if (updateError) {
      console.error('既読更新エラー:', updateError);
      return NextResponse.json({
        success: false,
        error: '既読更新に失敗しました',
        details: updateError.message
      }, { status: 500 });
    }

    console.log(`既読更新成功: ${updated?.length}件`);

    return NextResponse.json({
      success: true,
      message: `${updated?.length || 0}件のメッセージを既読にしました`,
      updatedCount: updated?.length || 0
    });

  } catch (error) {
    console.error('既読処理APIエラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '予期しないエラーが発生しました'
    }, { status: 500 });
  }
}