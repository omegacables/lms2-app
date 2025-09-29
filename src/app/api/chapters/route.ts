import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// GET: チャプター一覧取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('course_id');

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

    if (courseId) {
      // 特定コースのチャプター取得
      // まずチャプターのみを取得
      const { data: chapters, error: chaptersError } = await supabase
        .from('chapters')
        .select('*')
        .eq('course_id', courseId)
        .order('display_order', { ascending: true });

      if (chaptersError) {
        console.error('Error fetching chapters:', chaptersError);
        throw chaptersError;
      }

      // 各チャプターに関連する動画を取得
      const chaptersWithVideos = await Promise.all(
        (chapters || []).map(async (chapter) => {
          const { data: chapterVideos, error: videosError } = await supabase
            .from('chapter_videos')
            .select(`
              id,
              video_id,
              display_order,
              videos (
                id,
                title,
                duration,
                thumbnail_url
              )
            `)
            .eq('chapter_id', chapter.id)
            .order('display_order', { ascending: true });

          if (videosError) {
            console.error(`Error fetching videos for chapter ${chapter.id}:`, videosError);
            return { ...chapter, chapter_videos: [] };
          }

          return { ...chapter, chapter_videos: chapterVideos || [] };
        })
      );

      return NextResponse.json({ chapters: chaptersWithVideos });
    } else {
      // 全チャプター取得
      const { data: chapters, error } = await supabase
        .from('chapters')
        .select('*')
        .order('course_id', { ascending: true })
        .order('display_order', { ascending: true });

      if (error) throw error;

      return NextResponse.json({ chapters: chapters || [] });
    }
  } catch (error) {
    console.error('Error fetching chapters:', error);
    return NextResponse.json(
      { error: 'チャプターの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// POST: 新規チャプター作成
export async function POST(request: NextRequest) {
  try {
    const { course_id, title, description } = await request.json();

    if (!course_id || !title) {
      return NextResponse.json(
        { error: 'course_id と title は必須です' },
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
      .from('chapters')
      .select('display_order')
      .eq('course_id', course_id)
      .order('display_order', { ascending: false })
      .limit(1);

    if (maxOrderError) {
      console.error('Error fetching max order:', maxOrderError);
    }

    const nextOrder = maxOrderData && maxOrderData.length > 0
      ? (maxOrderData[0].display_order || 0) + 1
      : 0;

    console.log('Creating chapter with data:', {
      course_id: parseInt(course_id),
      title,
      description: description || null,
      display_order: nextOrder
    });

    // チャプターを作成
    const { data: chapter, error } = await supabase
      .from('chapters')
      .insert({
        course_id: parseInt(course_id),
        title,
        description: description || null,
        display_order: nextOrder
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting chapter:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      chapter
    });

  } catch (error: any) {
    console.error('Error creating chapter:', error);
    return NextResponse.json(
      {
        error: 'チャプターの作成に失敗しました',
        details: error?.message || String(error)
      },
      { status: 500 }
    );
  }
}

// PUT: チャプター順序更新
export async function PUT(request: NextRequest) {
  try {
    const { chapters } = await request.json();

    if (!Array.isArray(chapters)) {
      return NextResponse.json(
        { error: 'chapters配列が必要です' },
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

    // 各チャプターの順序を更新
    const updatePromises = chapters.map((chapter, index) =>
      supabase
        .from('chapters')
        .update({ display_order: index })
        .eq('id', chapter.id)
    );

    await Promise.all(updatePromises);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error updating chapters order:', error);
    return NextResponse.json(
      { error: 'チャプター順序の更新に失敗しました' },
      { status: 500 }
    );
  }
}