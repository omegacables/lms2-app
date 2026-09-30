// 添削の担当講師（自動添削の署名に使う名前）。サーバー専用。テーブル名・関数名は ai_instructors のまま。
//
// 小テスト・最終テストは回答・提出の直後に自動で添削し、コースの担当講師の署名「講師　{名前}」で返却する。
// 自動添削であること（essay_reviews.auto_reviewed ／ quiz_auto_reviews）と講師が確認したかどうかは記録に残し、
// 管理画面と学習記録PDF（「AIによる自動添削」と記載）で区別できるようにする。
// 講師は最大5名まで登録でき、コースごとに担当を選ぶ。

import type { SupabaseClient } from '@supabase/supabase-js';

export const MAX_AI_INSTRUCTORS = 5;
const SIGNATURE_PREFIX = '講師';

export interface AiInstructor {
  id: number;
  name: string;
  title: string | null;
  sort_order: number;
}

/** 署名の表記: 「講師　山田」／名前が無ければ「講師」 */
export function aiInstructorLabel(name: string | null | undefined): string {
  const n = (name || '').trim();
  return n ? `${SIGNATURE_PREFIX}　${n}` : SIGNATURE_PREFIX;
}

export async function listAiInstructors(admin: SupabaseClient): Promise<AiInstructor[]> {
  const { data } = await admin
    .from('ai_instructors')
    .select('id, name, title, sort_order')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  return (data || []) as AiInstructor[];
}

/** コースの添削を担当する講師（未設定なら最初に登録した講師。1人も登録が無ければ null） */
export async function resolveCourseAiInstructor(admin: SupabaseClient, courseId: number): Promise<AiInstructor | null> {
  const [{ data: course }, instructors] = await Promise.all([
    admin.from('courses').select('ai_instructor_id').eq('id', courseId).maybeSingle(),
    listAiInstructors(admin),
  ]);
  const chosen = course?.ai_instructor_id ? instructors.find((i) => i.id === course.ai_instructor_id) : undefined;
  return chosen || instructors[0] || null;
}

type ReviewOrigin = { auto_reviewed?: boolean | null; ai_instructor_name?: string | null };

/** 添削（essay_reviews）が自動添削から来たものか（講師が確認して返却し直したものを含む） */
export function isAutoOrigin(review: ReviewOrigin): boolean {
  return !!review.auto_reviewed || !!review.ai_instructor_name;
}

/** 受講者に見せる添削者名。自動添削（講師が確認したものを含む）は担当講師の名前、講師が自分で添削したものは講師本人の名前 */
export function reviewDisplayName(review: ReviewOrigin, humanName: string | null): string | null {
  if (isAutoOrigin(review)) return (review.ai_instructor_name || '').trim() || null;
  return humanName;
}

/** 添削（essay_reviews）の署名表記「講師　名前」（名前は reviewDisplayName と同じ決め方） */
export function reviewSignature(review: ReviewOrigin, humanName: string | null): string | null {
  if (isAutoOrigin(review)) return aiInstructorLabel(review.ai_instructor_name);
  return humanName ? `${SIGNATURE_PREFIX}　${humanName}` : null;
}
