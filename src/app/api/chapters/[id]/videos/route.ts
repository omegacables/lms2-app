import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// POST: チャプターに動画を追加
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id } = 'then' in params ? await params : params;
    const { video_id } = await request.json();

    if (!video_id) {
      return NextResponse.json(
        { error: 'video_id は必須です' },
        { status: 400 }
      );
    }

    // Authorizationヘッダーからトークンを取得
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // トークンを使ってSupabaseクライアントを作成
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    );

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 権限チェックを一時的に無効化（開発環境用）
    // TODO: 本番環境では必ず有効にすること
    /*
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || !['instructor', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: '講師または管理者権限が必要です' }, { status: 403 });
    }
    */

    // 現在の最大display_orderを取得
    const { data: maxOrderData, error: maxOrderError } = await supabase
      .from('chapter_videos')
      .select('display_order')
      .eq('chapter_id', id)
      .order('display_order', { ascending: false })
      .limit(1);

    if (maxOrderError) {
      console.error('Error fetching max order:', maxOrderError);
    }

    const nextOrder = maxOrderData && maxOrderData.length > 0
      ? (maxOrderData[0].display_order || 0) + 1
      : 0;

    // IDの型をそのまま使用（型変換なし）
    const chapterId = id;
    const videoIdNum = parseInt(video_id);

    console.log('Adding video to chapter:', {
      chapter_id: chapterId,
      video_id: videoIdNum,
      display_order: nextOrder,
      id_type: typeof chapterId
    });

    // まずチャプターが存在するか確認
    console.log('Checking if chapter exists:', chapterId);
    const { data: chapterExists, error: chapterCheckError } = await supabase
      .from('chapters')
      .select('id')
      .eq('id', chapterId)
      .single();

    console.log('Chapter check result:', { chapterExists, chapterCheckError });

    if (chapterCheckError) {
      console.error('Chapter not found:', chapterCheckError);
      console.error('Chapter error details:', JSON.stringify(chapterCheckError, null, 2));
      return NextResponse.json(
        {
          error: 'チャプターが見つかりません',
          details: `Chapter ID: ${chapterId}, Error: ${JSON.stringify(chapterCheckError, null, 2)}`
        },
        { status: 404 }
      );
    }

    // 動画が存在するか確認
    console.log('Checking if video exists:', videoIdNum);
    const { data: videoExists, error: videoCheckError } = await supabase
      .from('videos')
      .select('id')
      .eq('id', videoIdNum)
      .single();

    console.log('Video check result:', { videoExists, videoCheckError });

    if (videoCheckError) {
      console.error('Video not found:', videoCheckError);
      console.error('Video error details:', JSON.stringify(videoCheckError, null, 2));
      return NextResponse.json(
        {
          error: '動画が見つかりません',
          details: `Video ID: ${videoIdNum}, Error: ${JSON.stringify(videoCheckError, null, 2)}`
        },
        { status: 404 }
      );
    }

    // チャプターに動画を追加
    console.log('Attempting to insert into chapter_videos:', {
      chapter_id: chapterId,
      video_id: videoIdNum,
      display_order: nextOrder
    });

    const insertResult = await supabase
      .from('chapter_videos')
      .insert({
        chapter_id: chapterId,
        video_id: videoIdNum,
        display_order: nextOrder
      })
      .select();

    console.log('Insert result (without single()):', {
      data: insertResult.data,
      error: insertResult.error,
      status: insertResult.status,
      statusText: insertResult.statusText
    });

    if (insertResult.error) {
      console.error('Error inserting into chapter_videos:', insertResult.error);
      console.error('Error type:', typeof insertResult.error);
      console.error('Error keys:', Object.keys(insertResult.error));
      console.error('Error details:', JSON.stringify(insertResult.error, null, 2));
      return NextResponse.json(
        {
          error: '動画の追加に失敗しました',
          details: `Error: ${JSON.stringify(insertResult.error, null, 2) || insertResult.error.toString()}, Status: ${insertResult.status}`
        },
        { status: 500 }
      );
    }

    const data = insertResult.data?.[0];

    return NextResponse.json({
      success: true,
      data
    });

  } catch (error: any) {
    console.error('Error adding video to chapter:', error);
    return NextResponse.json(
      {
        error: '動画の追加に失敗しました',
        details: error?.message || error?.code || JSON.stringify(error)
      },
      { status: 500 }
    );
  }
}

// DELETE: チャプターから動画を削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id } = 'then' in params ? await params : params;
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('video_id');

    if (!videoId) {
      return NextResponse.json(
        { error: 'video_id は必須です' },
        { status: 400 }
      );
    }

    // Authorizationヘッダーからトークンを取得
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // トークンを使ってSupabaseクライアントを作成
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    );

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 権限チェックを一時的に無効化（開発環境用）
    // TODO: 本番環境では必ず有効にすること
    /*
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || !['instructor', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: '講師または管理者権限が必要です' }, { status: 403 });
    }
    */

    const { error } = await supabase
      .from('chapter_videos')
      .delete()
      .eq('chapter_id', id)
      .eq('video_id', videoId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: '動画をチャプターから削除しました'
    });

  } catch (error) {
    console.error('Error removing video from chapter:', error);
    return NextResponse.json(
      { error: '動画の削除に失敗しました' },
      { status: 500 }
    );
  }
}

// PUT: チャプター内の動画順序を更新
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id } = 'then' in params ? await params : params;
    const { videos } = await request.json();

    if (!Array.isArray(videos)) {
      return NextResponse.json(
        { error: 'videos配列が必要です' },
        { status: 400 }
      );
    }

    // Authorizationヘッダーからトークンを取得
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // トークンを使ってSupabaseクライアントを作成
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    );

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 権限チェックを一時的に無効化（開発環境用）
    // TODO: 本番環境では必ず有効にすること
    /*
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || !['instructor', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: '講師または管理者権限が必要です' }, { status: 403 });
    }
    */

    // 各動画の順序を更新
    const updatePromises = videos.map((video, index) =>
      supabase
        .from('chapter_videos')
        .update({ display_order: index })
        .eq('chapter_id', id)
        .eq('video_id', video.video_id)
    );

    await Promise.all(updatePromises);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error updating video order:', error);
    return NextResponse.json(
      { error: '動画順序の更新に失敗しました' },
      { status: 500 }
    );
  }
}