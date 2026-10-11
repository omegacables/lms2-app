import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // メッセージを取得
    const { data: message, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:sender_id(
          id,
          display_name,
          avatar_url
        ),
        receiver:receiver_id(
          id,
          display_name,
          avatar_url
        ),
        course:course_id(
          id,
          title
        )
      `)
      .eq('id', id)
      .single();

    if (error || !message) {
      console.error('Error fetching message:', error);
      return NextResponse.json({ error: 'メッセージが見つかりません' }, { status: 404 });
    }

    // メッセージを既読にする（受信者の場合）
    if (message.receiver_id === user.id && !message.is_read) {
      await supabase
        .from('messages')
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq('id', id);
      
      message.is_read = true;
    }

    // 返信メッセージがある場合は取得
    const { data: replies } = await supabase
      .from('messages')
      .select(`
        *,
        sender:sender_id(
          id,
          display_name,
          avatar_url
        )
      `)
      .eq('parent_message_id', message.id)
      .order('created_at', { ascending: true });

    return NextResponse.json({
      message,
      replies: replies || []
    });
  } catch (error) {
    console.error('Error in GET /api/messages/[id]:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();
    const { is_read } = body;

    // メッセージを更新
    const { data: message, error } = await supabase
      .from('messages')
      .update({
        is_read,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating message:', error);
      return NextResponse.json({ error: 'メッセージの更新に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'メッセージが更新されました',
      data: message
    });
  } catch (error) {
    console.error('Error in PATCH /api/messages/[id]:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // メッセージを削除（送信者のみ可能）
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', id)
      .eq('sender_id', user.id);

    if (error) {
      console.error('Error deleting message:', error);
      return NextResponse.json({ error: 'メッセージの削除に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'メッセージが削除されました'
    });
  } catch (error) {
    console.error('Error in DELETE /api/messages/[id]:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}