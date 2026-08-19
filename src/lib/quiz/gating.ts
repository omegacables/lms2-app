// 通信制対応：動画とクイズを一列に並べ、受講者ごとの通過状況・解放状況を計算する。
// サーバーサイド（service role クライアント）専用。ゲート制御・学習パス表示の両方から使う。
//
// 順序: [動画1, 動画1直後のクイズ..., 動画2, 動画2直後のクイズ..., ..., コース末クイズ...]
// 通過条件:
//   - 動画: video_view_logs に status='completed' の行がある
//   - 選択式クイズ: 全設問に is_correct=true の attempt がある（all_correct）
//   - 記述式クイズ: essay_reviews に result='passed' がある
// 解放条件: そのステップより前の全ステップが通過済み（先頭動画は常に解放）

import type { SupabaseClient } from '@supabase/supabase-js';

export type StepType = 'video' | 'quiz';

export interface GateStep {
  type: StepType;
  id: number;          // video_id または quiz_id
  title: string;
  quiz_type?: 'choice' | 'essay';
  after_video_id?: number | null;
  passed: boolean;
  unlocked: boolean;
  lockReason?: string; // 未解放の理由（直前の未通過ステップ名）
}

export interface GateState {
  steps: GateStep[];
  videoUnlocked: Record<number, { unlocked: boolean; reason?: string }>;
  quizUnlocked: Record<number, { unlocked: boolean; reason?: string }>;
  quizPassed: Record<number, boolean>;
  videoPassed: Record<number, boolean>;
  /** 全ステップ通過済みか（テスト必須コースの修了判定に利用） */
  allPassed: boolean;
}

export async function computeGateState(
  admin: SupabaseClient,
  userId: string,
  courseId: number
): Promise<GateState> {
  // 1. 動画（公開・file_url あり）
  const { data: videos } = await admin
    .from('videos')
    .select('id, title, order_index, file_url, status')
    .eq('course_id', courseId)
    .eq('status', 'active')
    .not('file_url', 'is', null)
    .order('order_index', { ascending: true });
  const videoList = (videos || []).filter((v) => v.file_url);

  // 2. コース設定（test_required = 通信制モードの ON/OFF マスタースイッチ）
  //    OFF のコースでは小テストを一切扱わない（＝従来どおり任意順で視聴可能）。
  //    これにより「小テストなしコース」は現行環境と完全に同一挙動になる（受入条件#7）。
  const { data: course } = await admin
    .from('courses')
    .select('test_required')
    .eq('id', courseId)
    .single();
  const testEnabled = course?.test_required === true;

  // 3. 公開クイズ（test_required=true のコースのみ対象）
  const { data: quizzes } = testEnabled
    ? await admin
        .from('quizzes')
        .select('id, title, quiz_type, after_video_id, sort_order')
        .eq('course_id', courseId)
        .eq('status', 'published')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
    : { data: [] as any[] };
  const quizList = quizzes || [];
  const quizIds = quizList.map((q) => q.id);

  // 3. 完了動画
  const { data: completedLogs } = await admin
    .from('video_view_logs')
    .select('video_id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('status', 'completed');
  const completedVideoIds = new Set((completedLogs || []).map((l) => l.video_id));

  // 4. クイズ通過判定用データ
  const quizPassed: Record<number, boolean> = {};
  if (quizIds.length > 0) {
    // 選択式：設問一覧
    const { data: questions } = await admin
      .from('quiz_questions')
      .select('id, quiz_id')
      .in('quiz_id', quizIds);
    const quizQuestionIds = new Map<number, Set<number>>();
    (questions || []).forEach((q) => {
      if (!quizQuestionIds.has(q.quiz_id)) quizQuestionIds.set(q.quiz_id, new Set());
      quizQuestionIds.get(q.quiz_id)!.add(q.id);
    });

    // 正解済み attempt
    const { data: correctAttempts } = await admin
      .from('quiz_attempts')
      .select('quiz_id, question_id')
      .eq('user_id', userId)
      .in('quiz_id', quizIds)
      .eq('is_correct', true);
    const correctByQuiz = new Map<number, Set<number>>();
    (correctAttempts || []).forEach((a) => {
      if (!correctByQuiz.has(a.quiz_id)) correctByQuiz.set(a.quiz_id, new Set());
      correctByQuiz.get(a.quiz_id)!.add(a.question_id);
    });

    // 記述式：合格レビュー
    const { data: passedReviews } = await admin
      .from('essay_reviews')
      .select('quiz_id')
      .eq('user_id', userId)
      .in('quiz_id', quizIds)
      .eq('result', 'passed');
    const essayPassedQuizIds = new Set((passedReviews || []).map((r) => r.quiz_id));

    for (const q of quizList) {
      if (q.quiz_type === 'essay') {
        quizPassed[q.id] = essayPassedQuizIds.has(q.id);
      } else {
        const need = quizQuestionIds.get(q.id) || new Set<number>();
        const got = correctByQuiz.get(q.id) || new Set<number>();
        // 設問が1問もない選択式は「未完成」とみなし未通過にする（公開時に弾いているが保険）
        quizPassed[q.id] = need.size > 0 && Array.from(need).every((qid) => got.has(qid));
      }
    }
  }

  // 5. ステップ列を構築
  const quizzesByVideo = new Map<number | 'end', typeof quizList>();
  for (const q of quizList) {
    const key = q.after_video_id ?? 'end';
    if (!quizzesByVideo.has(key)) quizzesByVideo.set(key, []);
    quizzesByVideo.get(key)!.push(q);
  }

  const steps: GateStep[] = [];
  const pushQuizzesAfter = (key: number | 'end') => {
    const qs = quizzesByVideo.get(key) || [];
    for (const q of qs) {
      steps.push({
        type: 'quiz',
        id: q.id,
        title: q.title,
        quiz_type: q.quiz_type,
        after_video_id: q.after_video_id,
        passed: !!quizPassed[q.id],
        unlocked: false,
      });
    }
  };

  for (const v of videoList) {
    steps.push({
      type: 'video',
      id: v.id,
      title: v.title,
      passed: completedVideoIds.has(v.id),
      unlocked: false,
    });
    pushQuizzesAfter(v.id);
  }
  pushQuizzesAfter('end');

  // 6. 前方累積で解放状態を決定
  //
  // 重要（既存コースへの影響防止 / 受入条件#7）:
  //   公開クイズが1つも無いコースではゲートを一切かけない（＝全ステップ解放）。
  //   これにより「小テストを設定していない従来コース」は今までどおり任意順で視聴できる。
  //   小テストが公開されているコース（＝通信制対応コース）でのみ、
  //   「直前までの動画完了＋配置済み小テスト全通過」の厳格ゲートが有効になる。
  const gatingActive = quizList.length > 0;

  if (!gatingActive) {
    for (const step of steps) step.unlocked = true;
  } else {
    let prevAllPassed = true;
    let firstUnpassedTitle: string | null = null;
    for (const step of steps) {
      step.unlocked = prevAllPassed;
      if (!prevAllPassed && firstUnpassedTitle) {
        step.lockReason = firstUnpassedTitle;
      }
      if (!step.passed && prevAllPassed) {
        // このステップが最初の未通過。以降はロック理由にこのステップ名を使う
        firstUnpassedTitle =
          step.type === 'quiz' ? `「${step.title}」` : `動画「${step.title}」`;
        prevAllPassed = false;
      }
    }
  }

  const videoUnlocked: Record<number, { unlocked: boolean; reason?: string }> = {};
  const quizUnlocked: Record<number, { unlocked: boolean; reason?: string }> = {};
  const videoPassed: Record<number, boolean> = {};
  for (const s of steps) {
    if (s.type === 'video') {
      videoUnlocked[s.id] = { unlocked: s.unlocked, reason: s.lockReason };
      videoPassed[s.id] = s.passed;
    } else {
      quizUnlocked[s.id] = { unlocked: s.unlocked, reason: s.lockReason };
    }
  }

  const allPassed = steps.length > 0 && steps.every((s) => s.passed);

  return { steps, videoUnlocked, quizUnlocked, quizPassed, videoPassed, allPassed };
}
