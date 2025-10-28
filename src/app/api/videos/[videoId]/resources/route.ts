import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/database/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId: videoIdParam } = await params;
    const videoId = parseInt(videoIdParam);

    console.log('\u30eaソース取得リクエスト - videoId:', videoId);

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
    const body = await request.json();

    console.log('リソース作成リクエスト:', { videoId, body });

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
      is_required: body.is_required || false
    };

    console.log('挿入データ:', insertData);

    const { data, error } = await supabase
      .from('video_resources')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Supabaseエラー:', error);
      throw error;
    }

    console.log('作成成功:', data);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('リソース作成エラー:', error);
    return NextResponse.json(
      {
        error: 'リソースの作成に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
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