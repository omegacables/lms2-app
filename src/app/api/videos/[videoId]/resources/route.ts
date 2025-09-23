import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/database/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId: videoIdParam } = await params;
    const videoId = parseInt(videoIdParam);

    const { data, error } = await supabase
      .from('video_resources')
      .select('*')
      .eq('video_id', videoId)
      .order('display_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('リソース取得エラー:', error);
    return NextResponse.json(
      { error: 'リソースの取得に失敗しました' },
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

    const { data, error } = await supabase
      .from('video_resources')
      .insert({
        video_id: videoId,
        ...body
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('リソース作成エラー:', error);
    return NextResponse.json(
      { error: 'リソースの作成に失敗しました' },
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