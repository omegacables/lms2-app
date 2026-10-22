import type { SupabaseClient } from '@supabase/supabase-js';
import { COURSE_TITLE_MAX, defaultCopyTitle } from '@/lib/course/copyTitle';

/**
 * コースをコピーする（/api/courses/[id]/duplicate から使う）。
 * - コース設定をコピー（名前は title。省略時は「元の名前-コピー1-」。非公開で作成）
 * - 動画は登録（videos の行）だけを作り、動画ファイルは複製せず元のコースと同じファイルを再生する。
 *   ファイルの削除は参照カウント付き（safeStorage.removeVideoAssetIfUnreferenced）なので、
 *   片方のコースで動画を削除・差し替えても、もう一方の動画は消えない。
 * - 章（chapters + chapter_videos、videos.chapter_id）と動画の資料（video_resources）をコピーし、新しいIDに付け替える
 * - 旧来の metadata.chapters 方式が使われている場合は video_ids を新IDへ付け替え
 * 小テスト・最終テスト（quizzes）はコピーしないので、コピーは通信制モード（test_required）を OFF にする。
 * 受講者の割り当て・進捗・ログもコピーしない。途中で失敗したら作りかけのコースを消す。
 *
 * DB によって列・テーブルが違う（stus-lms は chapters.id が uuid・videos.chapter_id・video_resources あり、
 * axialms は chapters.id が整数でどちらも無い）ので、元の行をそのまま写して ID だけ付け替える。
 */

export class CopyCourseError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export interface CopyCourseResult {
  course: any;
  copiedVideos: number;
  copiedChapters: number;
  copiedResources: number;
}

export async function copyCourse(
  admin: SupabaseClient,
  params: { sourceId: number; title?: string; userId: string }
): Promise<CopyCourseResult> {
  const { sourceId, userId } = params;
  const requestedTitle = (params.title || '').trim();
  if (requestedTitle.length > COURSE_TITLE_MAX) {
    throw new CopyCourseError(`コース名は${COURSE_TITLE_MAX}文字以内にしてください`, 400);
  }

  // 1. 元コースを取得
  const { data: source, error: srcErr } = await admin
    .from('courses')
    .select('*')
    .eq('id', sourceId)
    .single();
  if (srcErr || !source) throw new CopyCourseError('コースが見つかりません', 404);

  // 名前の指定が無ければ既定名（既存のコース名と重ならない番号）
  let title = requestedTitle;
  if (!title) {
    const { data: titles } = await admin.from('courses').select('title');
    title = defaultCopyTitle(source.title, (titles || []).map((t: any) => t.title as string));
  }

  // 末尾の order_index を決定
  const { data: maxRow } = await admin
    .from('courses')
    .select('order_index')
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (((maxRow?.order_index as number) ?? 0) + 1);

  // 2. コースをコピー（id・日時・metadata を除外）
  const { id: _srcCourseId, created_at, updated_at, metadata, ...courseRest } = source as any;
  const { data: newCourse, error: insErr } = await admin
    .from('courses')
    .insert({
      ...courseRest,
      title,
      status: 'inactive',
      order_index: nextOrder,
      created_by: userId,
      test_required: false,
    })
    .select()
    .single();
  if (insErr || !newCourse) {
    throw new CopyCourseError(`コースのコピーに失敗しました: ${insErr?.message ?? '不明なエラー'}`, 500);
  }
  const newCourseId = newCourse.id as number;

  try {
    // 3. 章（テーブル方式）をコピー（旧章ID → 新章ID）
    const chapterIdMap: Record<string, string | number> = {};
    const { data: chapters, error: chErr } = await admin
      .from('chapters')
      .select('*')
      .eq('course_id', sourceId)
      .order('display_order', { ascending: true });
    if (chErr) throw new Error(`章の取得に失敗しました: ${chErr.message}`);

    for (const ch of (chapters || []) as any[]) {
      const { id: oldChapterId, created_at: _cc, updated_at: _cu, ...chapterRest } = ch;
      const { data: newCh, error } = await admin
        .from('chapters')
        .insert({ ...chapterRest, course_id: newCourseId })
        .select('id')
        .single();
      if (error || !newCh) throw new Error(`章のコピーに失敗しました: ${error?.message ?? '不明なエラー'}`);
      chapterIdMap[String(oldChapterId)] = newCh.id;
    }

    // 4. 動画をコピー（ファイルは同じ file_url / file_path を参照。旧動画ID → 新動画ID）
    const videoIdMap: Record<number, number> = {};
    const { data: videos, error: vListErr } = await admin
      .from('videos')
      .select('*')
      .eq('course_id', sourceId)
      .order('order_index', { ascending: true })
      .order('id', { ascending: true });
    if (vListErr) throw new Error(`動画の取得に失敗しました: ${vListErr.message}`);

    for (const v of (videos || []) as any[]) {
      const { id: oldVideoId, created_at: _vc, updated_at: _vu, ...videoRest } = v;
      const row: any = { ...videoRest, course_id: newCourseId };
      // videos.chapter_id がある DB は新しい章に付け替える
      if ('chapter_id' in row) {
        row.chapter_id = row.chapter_id != null ? chapterIdMap[String(row.chapter_id)] ?? null : null;
      }
      const { data: newVideo, error } = await admin
        .from('videos')
        .insert(row)
        .select('id')
        .single();
      if (error || !newVideo) throw new Error(`動画「${v.title}」のコピーに失敗しました: ${error?.message ?? '不明なエラー'}`);
      videoIdMap[oldVideoId] = newVideo.id as number;
    }

    // 5. chapter_videos の付け替え
    const oldChapterIds = Object.keys(chapterIdMap);
    if (oldChapterIds.length > 0) {
      const { data: cvs, error: cvErr } = await admin
        .from('chapter_videos')
        .select('chapter_id, video_id, display_order')
        .in('chapter_id', oldChapterIds);
      if (cvErr) throw new Error(`章の動画の取得に失敗しました: ${cvErr.message}`);

      const rows = ((cvs || []) as any[])
        .map((cv) => {
          const newChapterId = chapterIdMap[String(cv.chapter_id)];
          const newVideoId = videoIdMap[cv.video_id];
          if (newChapterId == null || !newVideoId) return null;
          return { chapter_id: newChapterId, video_id: newVideoId, display_order: cv.display_order };
        })
        .filter(Boolean);
      if (rows.length > 0) {
        const { error } = await admin.from('chapter_videos').insert(rows as any[]);
        if (error) throw new Error(`章の動画のコピーに失敗しました: ${error.message}`);
      }
    }

    // 6. 動画の資料（video_resources。テーブルが無い DB もある）。ファイルは複製せず同じものを参照する
    let copiedResources = 0;
    const oldVideoIds = Object.keys(videoIdMap).map(Number);
    if (oldVideoIds.length > 0) {
      const { data: resources, error: resErr } = await admin
        .from('video_resources')
        .select('*')
        .in('video_id', oldVideoIds);
      if (resErr) {
        console.warn('[コースのコピー] video_resources を読めないため資料のコピーを省略:', resErr.message);
      } else if (resources && resources.length > 0) {
        const rows = (resources as any[]).map(({ id: _rid, created_at: _rc, updated_at: _ru, ...r }) => ({
          ...r,
          video_id: videoIdMap[r.video_id],
        }));
        const { error } = await admin.from('video_resources').insert(rows);
        if (error) throw new Error(`動画の資料のコピーに失敗しました: ${error.message}`);
        copiedResources = rows.length;
      }
    }

    // 7. 旧来の metadata.chapters 方式が使われている場合は video_ids を新IDへ付け替えてコピー
    if (metadata && Array.isArray(metadata.chapters)) {
      const remappedChapters = metadata.chapters.map((ch: any) => ({
        ...ch,
        video_ids: (ch.video_ids || [])
          .map((vid: number) => videoIdMap[vid])
          .filter((x: number | undefined) => !!x),
      }));
      const { error } = await admin
        .from('courses')
        .update({ metadata: { ...metadata, chapters: remappedChapters } })
        .eq('id', newCourseId);
      if (error) throw new Error(`章（旧方式）のコピーに失敗しました: ${error.message}`);
    }

    const result: CopyCourseResult = {
      course: newCourse,
      copiedVideos: oldVideoIds.length,
      copiedChapters: oldChapterIds.length,
      copiedResources,
    };

    const { error: logError } = await admin.from('system_logs').insert({
      user_id: userId,
      action: 'course_copied',
      resource_type: 'course',
      resource_id: String(newCourseId),
      details: {
        source_course_id: sourceId,
        source_title: source.title,
        title,
        videos: result.copiedVideos,
        chapters: result.copiedChapters,
        resources: copiedResources,
      },
    });
    if (logError) console.warn('[コースのコピー] system_logs への記録に失敗:', logError.message);

    return result;
  } catch (error) {
    // 作りかけのコースを消す（videos・chapters・chapter_videos・video_resources は CASCADE で消える。
    // 動画ファイルには触れないので、元のコースの動画はそのまま）
    const { error: rollbackError } = await admin.from('courses').delete().eq('id', newCourseId);
    if (rollbackError) console.error('[コースのコピー] 作りかけのコースを消せませんでした:', newCourseId, rollbackError.message);
    throw new CopyCourseError(error instanceof Error ? error.message : String(error), 500);
  }
}
