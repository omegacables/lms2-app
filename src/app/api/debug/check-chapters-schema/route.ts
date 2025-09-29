import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

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

    // chaptersテーブルのスキーマ情報を取得
    const { data: chaptersData, error: chaptersError } = await supabase
      .from('chapters')
      .select('*')
      .limit(5);

    // 特定のUUID章を確認
    const testChapterId = '61a88b60-7764-4419-80ba-eb3b6617929e';
    const { data: specificChapter, error: specificChapterError } = await supabase
      .from('chapters')
      .select('*')
      .eq('id', testChapterId)
      .single();

    // chapter_videosテーブルのスキーマ情報を取得
    const { data: chapterVideosData, error: chapterVideosError } = await supabase
      .from('chapter_videos')
      .select('*')
      .limit(5);

    // videosテーブルのスキーマ情報を取得
    const { data: videosData, error: videosError } = await supabase
      .from('videos')
      .select('*')
      .limit(5);

    return NextResponse.json({
      chapters: {
        samples: chaptersData || [],
        error: chaptersError,
        columns: chaptersData?.[0] ? Object.keys(chaptersData[0]) : [],
        count: chaptersData?.length || 0,
        idTypes: chaptersData?.map(c => ({ id: c.id, type: typeof c.id })) || []
      },
      specificChapter: {
        testId: testChapterId,
        found: !!specificChapter,
        data: specificChapter,
        error: specificChapterError
      },
      chapter_videos: {
        samples: chapterVideosData || [],
        error: chapterVideosError,
        columns: chapterVideosData?.[0] ? Object.keys(chapterVideosData[0]) : [],
        count: chapterVideosData?.length || 0
      },
      videos: {
        samples: videosData || [],
        error: videosError,
        columns: videosData?.[0] ? Object.keys(videosData[0]) : [],
        count: videosData?.length || 0
      }
    });

  } catch (error: any) {
    console.error('Error checking schema:', error);
    return NextResponse.json(
      {
        error: 'スキーマの確認に失敗しました',
        details: error?.message || String(error)
      },
      { status: 500 }
    );
  }
}