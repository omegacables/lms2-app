import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/database/supabase';
import { createClient } from '@supabase/supabase-js';

// Supabaseクライアントを認証付きで作成
async function createAuthenticatedClient(request?: NextRequest) {
  // Authorizationヘッダーからトークンを取得
  if (request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      return createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      });
    }
  }

  // Cookieから認証情報を取得
  const cookieStore = await cookies();
  return createServerSupabaseClient(cookieStore);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId: videoIdParam } = await params;
    const videoId = parseInt(videoIdParam);

    console.log('\u30eaソース取得リクエスト - videoId:', videoId);

    const supabase = await createAuthenticatedClient(request);
    const { data, error } = await supabase
      .from('video_resources')
      .select('*')
      .eq('video_id', videoId)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Supabase\u30a8ラー:', error);
      throw error;
    }

    console.log('\u53d6得\u3057\u305f\u30ea\u30bd\u30fc\u30b9\u6570:', data?.length || 0);
    console.log('\u30ea\u30bd\u30fc\u30b9\u306e\u7a2e\u985e:', data?.map(r => r.resource_type));

    return NextResponse.json({ data });
  } catch (error) {
    console.error('\u30ea\u30bd\u30fc\u30b9\u53d6\u5f97\u30a8\u30e9\u30fc:', error);
    return NextResponse.json(
      { error: '\u30ea\u30bd\u30fc\u30b9\u306e\u53d6\u5f97\u306b\u5931\u6557\u3057\u307e\u3057\u305f' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId: videoIdParam } = await params;
    const videoId = parseInt(videoIdParam);

    // バリデーション
    if (isNaN(videoId)) {
      return NextResponse.json(
        { error: '無効な動画IDです', details: 'Invalid video ID' },
        { status: 400 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json(
        { error: 'リクエストボディが不正です', details: 'Invalid JSON' },
        { status: 400 }
      );
    }

    console.log('リソース作成リクエスト:', { videoId, body });

    // バリデーション
    if (!body.resource_type || !body.title) {
      return NextResponse.json(
        { error: '必須フィールドが不足しています', details: 'Missing required fields: resource_type, title' },
        { status: 400 }
      );
    }

    // Supabaseクライアントを作成
    const supabase = await createAuthenticatedClient(request);

    // 認証情報を確認
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('認証エラー:', authError);
      return NextResponse.json(
        { error: '認証が必要です', details: authError?.message || 'Auth session missing!' },
        { status: 401 }
      );
    }

    console.log('認証ユーザー:', { id: user.id, email: user.email });

    // ユーザーの権限を確認
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('プロフィール取得エラー:', profileError);
      return NextResponse.json(
        { error: 'ユーザー情報の取得に失敗しました', details: profileError.message },
        { status: 500 }
      );
    }

    console.log('ユーザー権限:', profile?.role);

    if (!profile || !['admin', 'instructor'].includes(profile.role)) {
      return NextResponse.json(
        { error: '権限がありません', details: `Your role is: ${profile?.role}. Required: admin or instructor` },
        { status: 403 }
      );
    }

    // created_byは不要（RLSで自動設定されるか、NULL許可）
    const insertData = {
      video_id: videoId,
      resource_type: body.resource_type,
      title: body.title,
      description: body.description || null,
      file_url: body.file_url || null,
      file_name: body.file_name || null,
      file_size: body.file_size || null,
      file_type: body.file_type || null,
      content: body.content || null,
      display_order: body.display_order || 0,
      is_required: body.is_required || false,
      created_by: user.id
    };

    console.log('挿入データ:', insertData);

    const { data, error } = await supabase
      .from('video_resources')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Supabaseエラー:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });

      return NextResponse.json(
        {
          error: 'データベースエラー',
          details: error.message,
          hint: error.hint,
          code: error.code
        },
        { status: 500 }
      );
    }

    console.log('作成成功:', data);
    return NextResponse.json({ data, success: true });
  } catch (error) {
    console.error('リソース作成エラー:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error('エラー詳細:', { message: errorMessage, stack: errorStack });

    return NextResponse.json(
      {
        error: 'リソースの作成に失敗しました',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'リソースIDが必要です' },
        { status: 400 }
      );
    }

    const supabase = await createAuthenticatedClient(request);
    const { data, error } = await supabase
      .from('video_resources')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('リソース更新エラー:', error);
    return NextResponse.json(
      { error: 'リソースの更新に失敗しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const resourceId = searchParams.get('id');

    if (!resourceId) {
      return NextResponse.json(
        { error: 'リソースIDが必要です' },
        { status: 400 }
      );
    }

    const supabase = await createAuthenticatedClient(request);
    const { error } = await supabase
      .from('video_resources')
      .delete()
      .eq('id', resourceId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('リソース削除エラー:', error);
    return NextResponse.json(
      { error: 'リソースの削除に失敗しました' },
      { status: 500 }
    );
  }
}