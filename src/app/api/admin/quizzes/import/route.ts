import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { parseCSV } from '@/lib/utils/csv';

export const runtime = 'nodejs';

// CSV列: コースID, 配置動画ID, テスト名, 設問, 選択肢1, 選択肢2, 選択肢3, 選択肢4, 正答番号, 解説
// 1行 = 1設問。(コースID, 配置動画ID, テスト名) が同じ行が1つのクイズにまとまる。
// 正答番号は 1始まり（CSV）→ 0始まり（DB）に変換。配置動画IDが空ならコース末。
//
// 冪等性: 同じ (course_id, after_video_id, title) の下書きクイズが既にあれば、
//   回答記録が無い場合に限り設問を差し替える。回答記録があるクイズはスキップ。

const HEADER = ['コースID', '配置動画ID', 'テスト名', '設問', '選択肢1', '選択肢2', '選択肢3', '選択肢4', '正答番号', '解説'];

interface ParsedQuestion {
  question_text: string;
  choices: string[];
  correct_index: number;
  explanation: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const csvText: string = body.csv || '';
  const dryRun: boolean = !!body.dryRun;
  if (!csvText.trim()) {
    return NextResponse.json({ error: 'CSVデータが空です' }, { status: 400 });
  }

  const rows = parseCSV(csvText).filter((r) => r.some((c) => (c ?? '').trim() !== ''));
  if (rows.length < 2) {
    return NextResponse.json({ error: 'ヘッダー＋1行以上のデータが必要です' }, { status: 400 });
  }

  // ヘッダー確認（先頭数列だけ緩く検証）
  const header = rows[0].map((h) => h.trim());
  if (header[0] !== HEADER[0] || header[2] !== HEADER[2] || header[3] !== HEADER[3]) {
    return NextResponse.json(
      { error: `ヘッダーが不正です。想定: ${HEADER.join(', ')}` },
      { status: 400 }
    );
  }

  // 行をクイズ単位にグループ化
  const groups = new Map<string, { course_id: number; after_video_id: number | null; title: string; questions: ParsedQuestion[] }>();
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const lineNo = i + 1;
    const courseId = Number((r[0] || '').trim());
    const afterVideoRaw = (r[1] || '').trim();
    const afterVideoId = afterVideoRaw ? Number(afterVideoRaw) : null;
    const title = (r[2] || '').trim();
    const questionText = (r[3] || '').trim();
    const choices = [r[4], r[5], r[6], r[7]].map((c) => (c ?? '').trim()).filter((c) => c !== '');
    const correctRaw = (r[8] || '').trim();
    const explanation = (r[9] || '').trim() || null;

    if (!courseId || !title || !questionText) {
      errors.push(`${lineNo}行目: コースID・テスト名・設問は必須です`);
      continue;
    }
    if (afterVideoRaw && !Number.isFinite(afterVideoId)) {
      errors.push(`${lineNo}行目: 配置動画IDが数値ではありません`);
      continue;
    }
    if (choices.length < 2) {
      errors.push(`${lineNo}行目: 選択肢が2つ以上必要です`);
      continue;
    }
    const correctNo = Number(correctRaw);
    if (!Number.isFinite(correctNo) || correctNo < 1 || correctNo > choices.length) {
      errors.push(`${lineNo}行目: 正答番号は1〜${choices.length}で指定してください`);
      continue;
    }

    const key = `${courseId}|${afterVideoId ?? 'end'}|${title}`;
    if (!groups.has(key)) {
      groups.set(key, { course_id: courseId, after_video_id: afterVideoId, title, questions: [] });
    }
    groups.get(key)!.questions.push({
      question_text: questionText,
      choices,
      correct_index: correctNo - 1,
      explanation,
    });
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: 'CSVにエラーがあります', errors }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // コース・動画の存在確認
  const summary: { title: string; course_id: number; after_video_id: number | null; questions: number; action: string }[] = [];

  for (const g of groups.values()) {
    // コース存在確認
    const { data: course } = await admin.from('courses').select('id').eq('id', g.course_id).single();
    if (!course) {
      errors.push(`コースID ${g.course_id} が存在しません（テスト「${g.title}」）`);
      continue;
    }
    if (g.after_video_id !== null) {
      const { data: video } = await admin
        .from('videos')
        .select('id, course_id')
        .eq('id', g.after_video_id)
        .single();
      if (!video || video.course_id !== g.course_id) {
        errors.push(`配置動画ID ${g.after_video_id} がコース${g.course_id}に存在しません（テスト「${g.title}」）`);
        continue;
      }
    }
    summary.push({
      title: g.title,
      course_id: g.course_id,
      after_video_id: g.after_video_id,
      questions: g.questions.length,
      action: 'pending',
    });
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: 'CSVにエラーがあります', errors }, { status: 400 });
  }

  if (dryRun) {
    return NextResponse.json({ dryRun: true, summary, quizCount: summary.length });
  }

  // 実際の投入
  let idx = 0;
  for (const g of groups.values()) {
    const s = summary[idx++];
    // 既存の同名クイズを探す（course_id + title で取得し、after_video_id はJSで一致確認）
    const { data: candidates } = await admin
      .from('quizzes')
      .select('id, after_video_id')
      .eq('course_id', g.course_id)
      .eq('title', g.title);

    const matched = (candidates || []).find(
      (c) => (c.after_video_id ?? null) === g.after_video_id
    );
    let quizId: number | null = matched ? matched.id : null;

    if (quizId) {
      // 回答記録があるかチェック
      const { count } = await admin
        .from('quiz_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('quiz_id', quizId);
      if ((count || 0) > 0) {
        s.action = 'skipped(回答記録あり)';
        continue;
      }
      // 設問差し替え
      await admin.from('quiz_questions').delete().eq('quiz_id', quizId);
      s.action = 'replaced';
    } else {
      const { data: newQuiz, error: quizErr } = await admin
        .from('quizzes')
        .insert({
          course_id: g.course_id,
          after_video_id: g.after_video_id,
          title: g.title,
          quiz_type: 'choice',
          status: 'draft',
          created_by: auth.user.id,
        })
        .select('id')
        .single();
      if (quizErr || !newQuiz) {
        errors.push(`テスト「${g.title}」の作成に失敗: ${quizErr?.message}`);
        continue;
      }
      quizId = newQuiz.id;
      s.action = 'created';
    }

    const questionRows = g.questions.map((q, i) => ({
      quiz_id: quizId,
      question_text: q.question_text,
      choices: q.choices,
      correct_index: q.correct_index,
      explanation: q.explanation,
      sort_order: i,
    }));
    const { error: insErr } = await admin.from('quiz_questions').insert(questionRows);
    if (insErr) {
      errors.push(`テスト「${g.title}」の設問投入に失敗: ${insErr.message}`);
    }
  }

  return NextResponse.json({
    success: errors.length === 0,
    summary,
    quizCount: summary.length,
    errors: errors.length ? errors : undefined,
  });
}
