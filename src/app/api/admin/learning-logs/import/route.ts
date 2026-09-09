import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type LogStatus = 'not_started' | 'in_progress' | 'completed';

interface ImportRow {
  rowNumber: number;
  email: string;
  courseTitle: string;
  videoTitle: string;
  startTime: string | null;
  endTime: string | null;
  watchDuration: number;
  progress: number;
  status: LogStatus;
  historyIndex?: number;
}

// 照合用の正規化（全角半角・大文字小文字・空白差を吸収）
const normalize = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// Supabaseの1000件制限を回避して全件取得する
async function fetchAll<T>(
  client: SupabaseClient,
  table: string,
  columns: string
): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  const all: T[] = [];

  for (;;) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`${table} の取得に失敗しました: ${error.message}`);
    if (!data || data.length === 0) break;

    all.push(...(data as unknown as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 認証確認
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 管理者権限を確認（インポートは既存ログを上書きするため管理者のみ）
    const { data: currentUser, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const body = await request.json();
    const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : [];

    if (rows.length === 0) {
      return NextResponse.json({ error: 'インポートするデータがありません' }, { status: 400 });
    }

    // 照合用マスタを取得
    const users = await fetchAll<{ id: string; email: string | null }>(
      supabaseAdmin,
      'user_profiles',
      'id, email'
    );
    const courses = await fetchAll<{ id: number; title: string | null }>(
      supabaseAdmin,
      'courses',
      'id, title'
    );
    const videos = await fetchAll<{ id: number; title: string | null; course_id: number | null }>(
      supabaseAdmin,
      'videos',
      'id, title, course_id'
    );

    const userByEmail = new Map<string, string>();
    users.forEach((u) => {
      if (u.email) userByEmail.set(normalize(u.email), String(u.id));
    });

    const courseByTitle = new Map<string, number>();
    courses.forEach((c) => {
      const key = normalize(c.title);
      if (key && !courseByTitle.has(key)) courseByTitle.set(key, Number(c.id));
    });

    // 動画は「コース内タイトル」優先、見つからなければタイトルのみで照合
    const videoByCourseTitle = new Map<string, number>();
    const videoByTitle = new Map<string, number>();
    videos.forEach((v) => {
      const key = normalize(v.title);
      if (!key) return;
      if (v.course_id !== null && v.course_id !== undefined) {
        const scoped = `${String(v.course_id)}::${key}`;
        if (!videoByCourseTitle.has(scoped)) videoByCourseTitle.set(scoped, Number(v.id));
      }
      if (!videoByTitle.has(key)) videoByTitle.set(key, Number(v.id));
    });

    const errors: string[] = [];

    interface ResolvedRow extends ImportRow {
      userId: string;
      courseId: number;
      videoId: number;
    }

    const resolved: ResolvedRow[] = [];

    rows.forEach((row) => {
      const label = `${row.rowNumber}行目`;

      const userId = userByEmail.get(normalize(row.email));
      if (!userId) {
        errors.push(`${label}: メールアドレス「${row.email}」のユーザーが見つかりません`);
        return;
      }

      const courseId = courseByTitle.get(normalize(row.courseTitle));
      if (courseId === undefined) {
        errors.push(`${label}: コース「${row.courseTitle}」が見つかりません`);
        return;
      }

      const videoKey = normalize(row.videoTitle);
      const videoId =
        videoByCourseTitle.get(`${String(courseId)}::${videoKey}`) ?? videoByTitle.get(videoKey);
      if (videoId === undefined) {
        errors.push(`${label}: 動画「${row.videoTitle}」が見つかりません`);
        return;
      }

      const status: LogStatus =
        row.status === 'completed' || row.status === 'in_progress' || row.status === 'not_started'
          ? row.status
          : 'not_started';

      const progress = Math.min(100, Math.max(0, Math.round(Number(row.progress) || 0)));
      const watchDuration = Math.max(0, Math.round(Number(row.watchDuration) || 0));

      resolved.push({
        ...row,
        userId,
        courseId,
        videoId,
        status,
        progress,
        watchDuration,
      });
    });

    if (resolved.length === 0) {
      return NextResponse.json(
        {
          error: 'インポートできる行がありません',
          errors,
          imported: 0,
          deleted: 0,
        },
        { status: 400 }
      );
    }

    // 同じ「ユーザー×動画」の行をまとめ、既存ログを削除してから登録し直す（＝上書き）
    const groups = new Map<string, ResolvedRow[]>();
    resolved.forEach((row) => {
      const key = `${row.userId}::${row.videoId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    });

    let imported = 0;
    let deleted = 0;
    const affectedPairs = new Map<string, { userId: string; courseId: number }>();

    for (const [key, groupRows] of groups) {
      const [userId, videoIdStr] = key.split('::');
      const videoId = Number(videoIdStr);

      // 既存ログを取得（削除件数の把握用）
      const { data: existing, error: existingError } = await supabaseAdmin
        .from('video_view_logs')
        .select('id')
        .eq('user_id', userId)
        .eq('video_id', videoId);

      if (existingError) {
        errors.push(`既存ログの取得に失敗しました (video_id=${videoId}): ${existingError.message}`);
        continue;
      }

      if (existing && existing.length > 0) {
        const { error: deleteError } = await supabaseAdmin
          .from('video_view_logs')
          .delete()
          .eq('user_id', userId)
          .eq('video_id', videoId);

        if (deleteError) {
          errors.push(`既存ログの削除に失敗しました (video_id=${videoId}): ${deleteError.message}`);
          continue;
        }
        deleted += existing.length;
      }

      // 履歴番号があればその順で登録する
      const ordered = [...groupRows].sort((a, b) => {
        const ai = a.historyIndex ?? Number.MAX_SAFE_INTEGER;
        const bi = b.historyIndex ?? Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        return a.rowNumber - b.rowNumber;
      });

      const payload = ordered.map((row) => {
        const startTime = row.startTime || row.endTime || new Date().toISOString();
        return {
          user_id: row.userId,
          video_id: row.videoId,
          course_id: row.courseId,
          start_time: startTime,
          end_time: row.endTime,
          total_watched_time: row.watchDuration,
          progress_percent: row.progress,
          status: row.status,
          completed_at: row.status === 'completed' ? row.endTime || startTime : null,
          current_position: row.watchDuration,
          last_updated: new Date().toISOString(),
        };
      });

      const { data: insertedRows, error: insertError } = await supabaseAdmin
        .from('video_view_logs')
        .insert(payload)
        .select('id');

      if (insertError) {
        errors.push(`ログの登録に失敗しました (video_id=${videoId}): ${insertError.message}`);
        continue;
      }

      imported += insertedRows?.length ?? 0;
      ordered.forEach((row) => {
        affectedPairs.set(`${row.userId}::${row.courseId}`, {
          userId: row.userId,
          courseId: row.courseId,
        });
      });
    }

    return NextResponse.json({
      success: true,
      imported,
      deleted,
      groups: groups.size,
      errors,
      // 証明書の再判定用（ユーザー×コースの組み合わせ）
      affectedPairs: Array.from(affectedPairs.values()),
    });
  } catch (error) {
    console.error('学習ログインポートエラー:', error);
    return NextResponse.json(
      {
        error: '学習ログのインポートに失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
