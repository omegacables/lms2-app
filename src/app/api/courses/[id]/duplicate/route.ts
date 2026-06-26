import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/database/adminSupabase';
import { requireAdmin } from '@/lib/auth/requireAdmin';

/**
 * コースを複製する（管理者専用）。
 * - コース設定をコピー（タイトルに「（コピー）」を付与し、非公開で作成）
 * - コース内の全動画をコピー（動画ファイルは複製せず同じURLを参照）
 * - 章（chapters + chapter_videos）をコピーし、新しい動画/章IDに付け替え
 * - 旧来の metadata.chapters 方式が使われている場合は video_ids を新IDへ付け替え
 * 受講者・進捗・ログはコピーしない。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const sourceId = parseInt(params.id);
    if (!sourceId || isNaN(sourceId)) {
      return NextResponse.json({ error: '無効なコースIDです' }, { status: 400 });
    }

    // 1. 元コースを取得
    const { data: source, error: srcErr } = await adminSupabase
      .from('courses')
      .select('*')
      .eq('id', sourceId)
      .single();

    if (srcErr || !source) {
      return NextResponse.json({ error: 'コースが見つかりません' }, { status: 404 });
    }

    // 末尾の order_index を決定
    const { data: maxRow } = await adminSupabase
      .from('courses')
      .select('order_index')
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (((maxRow?.order_index as number) ?? 0) + 1);

    // 2. コースを複製（id・日時・metadata を除外）
    const { id: _srcCourseId, created_at, updated_at, metadata, ...courseRest } = source as any;
    const newCourseInsert: any = {
      ...courseRest,
      title: `${source.title}（コピー）`,
      status: 'inactive',
      order_index: nextOrder,
      created_by: auth.user.id,
    };

    const { data: newCourse, error: insErr } = await adminSupabase
      .from('courses')
      .insert(newCourseInsert)
      .select()
      .single();

    if (insErr || !newCourse) {
      return NextResponse.json(
        { error: `コースの複製に失敗しました: ${insErr?.message ?? '不明なエラー'}` },
        { status: 500 }
      );
    }

    const newCourseId = newCourse.id as number;

    // 3. 動画を複製（旧動画ID → 新動画IDのマップを作る）
    const videoIdMap: Record<number, number> = {};
    const { data: videos } = await adminSupabase
      .from('videos')
      .select('*')
      .eq('course_id', sourceId)
      .order('order_index', { ascending: true });

    if (videos && videos.length > 0) {
      for (const v of videos as any[]) {
        const { id: oldVideoId, created_at: _vc, updated_at: _vu, ...videoRest } = v;
        const { data: newVideo, error: vErr } = await adminSupabase
          .from('videos')
          .insert({ ...videoRest, course_id: newCourseId })
          .select('id')
          .single();
        if (!vErr && newVideo) {
          videoIdMap[oldVideoId] = newVideo.id as number;
        }
      }
    }

    // 4. 章（テーブル方式）を複製（best-effort）
    try {
      const { data: chapters } = await adminSupabase
        .from('chapters')
        .select('*')
        .eq('course_id', sourceId)
        .order('display_order', { ascending: true });

      if (chapters && chapters.length > 0) {
        const chapterIdMap: Record<number, number> = {};
        for (const ch of chapters as any[]) {
          const { id: oldChapterId, created_at: _cc, updated_at: _cu, ...chapterRest } = ch;
          const { data: newCh } = await adminSupabase
            .from('chapters')
            .insert({ ...chapterRest, course_id: newCourseId })
            .select('id')
            .single();
          if (newCh) chapterIdMap[oldChapterId] = newCh.id as number;
        }

        // chapter_videos の付け替え
        const oldChapterIds = (chapters as any[]).map((c) => c.id);
        const { data: cvs } = await adminSupabase
          .from('chapter_videos')
          .select('*')
          .in('chapter_id', oldChapterIds);

        if (cvs && cvs.length > 0) {
          const rows = (cvs as any[])
            .map((cv) => {
              const newChapterId = chapterIdMap[cv.chapter_id];
              const newVideoId = videoIdMap[cv.video_id];
              if (!newChapterId || !newVideoId) return null;
              return {
                chapter_id: newChapterId,
                video_id: newVideoId,
                display_order: cv.display_order,
              };
            })
            .filter(Boolean);
          if (rows.length > 0) {
            await adminSupabase.from('chapter_videos').insert(rows as any[]);
          }
        }
      }
    } catch (chapterErr) {
      console.warn('[コース複製] 章（テーブル方式）の複製をスキップ:', chapterErr);
    }

    // 5. 旧来の metadata.chapters 方式が使われている場合は video_ids を新IDへ付け替えてコピー
    try {
      if (metadata && Array.isArray(metadata.chapters)) {
        const remappedChapters = metadata.chapters.map((ch: any) => ({
          ...ch,
          video_ids: (ch.video_ids || [])
            .map((vid: number) => videoIdMap[vid])
            .filter((x: number | undefined) => !!x),
        }));
        await adminSupabase
          .from('courses')
          .update({ metadata: { ...metadata, chapters: remappedChapters } })
          .eq('id', newCourseId);
      }
    } catch (metaErr) {
      console.warn('[コース複製] metadata方式の章の複製をスキップ:', metaErr);
    }

    return NextResponse.json({
      success: true,
      newCourseId,
      course: newCourse,
      copiedVideos: Object.keys(videoIdMap).length,
      message: 'コースを複製しました',
    });
  } catch (error: any) {
    console.error('コース複製エラー:', error);
    return NextResponse.json(
      { error: error.message || 'コース複製中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
