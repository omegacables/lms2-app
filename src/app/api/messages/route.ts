import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const messageType = searchParams.get('type');
    const courseId = searchParams.get('course_id');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
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
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // メッセージタイプでフィルタ
    if (messageType) {
      query = query.eq('message_type', messageType);
    }

    // コースでフィルタ
    if (courseId) {
      query = query.eq('course_id', courseId);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error('Error fetching messages:', error);
      return NextResponse.json({ error: 'メッセージの取得に失敗しました' }, { status: 500 });
    }

    // 未読メッセージ数も取得
    const { count: unreadCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', user.id)
      .eq('is_read', false);

    return NextResponse.json({
      messages,
      unread_count: unreadCount || 0,
      pagination: {
        offset,
        limit,
        has_more: messages.length === limit
      }
    });
  } catch (error) {
    console.error('Error in GET /api/messages:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();
    const {
      receiver_id,
      course_id,
      subject,
      content,
      message_type = 'private',
      parent_message_id
    } = body;

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: 'メッセージ内容は必須です' }, { status: 400 });
    }

    // アナウンスメントは管理者のみ
    if (message_type === 'announcement') {
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!userProfile || userProfile.role !== 'admin') {
        return NextResponse.json({ error: 'アナウンスメントは管理者のみ送信できます' }, { status: 403 });
      }
    }

    // メッセージを送信
    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        receiver_id,
        course_id,
        subject,
        content: content.trim(),
        message_type,
        parent_message_id
      })
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
      .single();

    if (error) {
      console.error('Error sending message:', error);
      return NextResponse.json({ error: 'メッセージの送信に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'メッセージが送信されました',
      data: message
    });
  } catch (error) {
    console.error('Error in POST /api/messages:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}