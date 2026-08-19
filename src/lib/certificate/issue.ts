import type { SupabaseClient } from '@supabase/supabase-js';
import { computeGateState } from '@/lib/quiz/gating';

export type IssueResult =
  | { ok: true; created: boolean; certificateId: string; completionDate: string }
  | { ok: false; reason: string; progress?: { completed: number; total: number } };

function generateCertificateId(): string {
  const random = Math.random().toString(36).substring(2, 9).toUpperCase();
  return `CERT-${Date.now()}-${random}`;
}

/**
 * 修了要件を満たしていれば修了証を発行する（冪等）。
 * 通常コース: 全動画（active かつ file_url あり）が完了していること。
 * 通信制コース（test_required=true）: 加えて全小テスト通過＋記述式最終テスト添削合格（=gate.allPassed）。
 */
export async function issueCertificateIfEligible(
  admin: SupabaseClient,
  userId: string,
  courseId: number
): Promise<IssueResult> {
  // 既存証明書
  const { data: existing } = await admin
    .from('certificates')
    .select('id, completion_date')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();
  if (existing) {
    return { ok: true, created: false, certificateId: existing.id, completionDate: existing.completion_date };
  }

  const { data: course } = await admin
    .from('courses')
    .select('id, title, test_required')
    .eq('id', courseId)
    .single();
  if (!course) return { ok: false, reason: 'コースが見つかりません' };

  const { data: userProfile } = await admin
    .from('user_profiles')
    .select('display_name, email')
    .eq('id', userId)
    .single();
  if (!userProfile) return { ok: false, reason: 'ユーザーが見つかりません' };

  // 動画完了チェック
  const { data: videos } = await admin
    .from('videos')
    .select('id, file_url')
    .eq('course_id', courseId)
    .eq('status', 'active')
    .not('file_url', 'is', null);
  const totalVideos = (videos || []).filter((v) => v.file_url).length;

  const { data: completedLogs } = await admin
    .from('video_view_logs')
    .select('video_id, completed_at, last_updated, created_at')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('status', 'completed');
  const completedIds = new Set((completedLogs || []).map((l) => l.video_id));
  const completedVideos = completedIds.size;

  if (completedVideos < totalVideos) {
    return { ok: false, reason: `コースが完了していません (${completedVideos}/${totalVideos} 動画完了)`, progress: { completed: completedVideos, total: totalVideos } };
  }

  // 完了日 = 最後に完了した動画の日時
  let completionDate = new Date();
  if (completedLogs && completedLogs.length > 0) {
    const last = completedLogs.reduce((latest, log) => {
      const d = new Date(log.completed_at || log.last_updated || log.created_at);
      const ld = new Date(latest.completed_at || latest.last_updated || latest.created_at);
      return d > ld ? log : latest;
    }, completedLogs[0]);
    completionDate = new Date(last.completed_at || last.last_updated || last.created_at);
  }

  // 通信制コースはテスト通過も必須
  if (course.test_required) {
    const gate = await computeGateState(admin, userId, courseId);
    if (!gate.allPassed) {
      return { ok: false, reason: '小テスト・最終テストが未完了です（全通過＋添削合格が必要）' };
    }
    // 最終添削合格日を完了日として考慮（動画完了より後になり得る）
    const { data: passedReviews } = await admin
      .from('essay_reviews')
      .select('reviewed_at')
      .eq('user_id', userId)
      .eq('result', 'passed')
      .order('reviewed_at', { ascending: false })
      .limit(1);
    if (passedReviews && passedReviews.length > 0) {
      const rd = new Date(passedReviews[0].reviewed_at);
      if (rd > completionDate) completionDate = rd;
    }
  }

  const certificateId = generateCertificateId();
  const { data: created, error } = await admin
    .from('certificates')
    .insert({
      id: certificateId,
      user_id: userId,
      course_id: courseId,
      user_name: userProfile.display_name || userProfile.email || 'ユーザー',
      course_title: course.title,
      completion_date: completionDate.toISOString(),
      is_active: true,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    // 競合で既に作られた場合は取得し直す
    if (error.code === '23505' || error.message?.includes('duplicate')) {
      const { data: race } = await admin
        .from('certificates')
        .select('id, completion_date')
        .eq('user_id', userId)
        .eq('course_id', courseId)
        .maybeSingle();
      if (race) return { ok: true, created: false, certificateId: race.id, completionDate: race.completion_date };
    }
    return { ok: false, reason: `証明書の作成に失敗しました: ${error.message}` };
  }

  return { ok: true, created: true, certificateId: created.id, completionDate: completionDate.toISOString() };
}
