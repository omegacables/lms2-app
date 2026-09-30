// AI講師（自動添削の署名に使う名前）。サーバー専用。
//
// 小テスト・最終テストは回答・提出の直後に AI講師が自動で添削して返却する。
// 署名は必ず「AI講師　{名前}」とし、人の講師が添削したものと区別する（訓練記録上の誤認を防ぐため、
// 「AI講師」の表記は外せない）。AI講師は最大5名まで登録でき、コースごとに担当を選ぶ。

import type { SupabaseClient } from '@supabase/supabase-js';

export const MAX_AI_INSTRUCTORS = 5;
export const AI_INSTRUCTOR_PREFIX = 'AI講師';

export interface AiInstructor {
  id: number;
  name: string;
  title: string | null;
  sort_order: number;
}

/** 署名の表記: 「AI講師　山田」／名前が無ければ「AI講師」 */
export function aiInstructorLabel(name: string | null | undefined): string {
  const n = (name || '').trim();
  return n ? `${AI_INSTRUCTOR_PREFIX}　${n}` : AI_INSTRUCTOR_PREFIX;
}

export async function listAiInstructors(admin: SupabaseClient): Promise<AiInstructor[]> {
  const { data } = await admin
    .from('ai_instructors')
    .select('id, name, title, sort_order')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  return (data || []) as AiInstructor[];
}

/** コースの添削を担当する AI講師（未設定なら最初に登録した AI講師。1人も登録が無ければ null） */
export async function resolveCourseAiInstructor(admin: SupabaseClient, courseId: number): Promise<AiInstructor | null> {
  const [{ data: course }, instructors] = await Promise.all([
    admin.from('courses').select('ai_instructor_id').eq('id', courseId).maybeSingle(),
    listAiInstructors(admin),
  ]);
  const chosen = course?.ai_instructor_id ? instructors.find((i) => i.id === course.ai_instructor_id) : undefined;
  return chosen || instructors[0] || null;
}

/** 添削（essay_reviews）の署名表記。AI講師の自動添削なら「AI講師　名前」、人の講師なら「講師　名前」 */
export function reviewSignature(review: { auto_reviewed?: boolean | null; ai_instructor_name?: string | null }, humanName: string | null): string | null {
  if (review.auto_reviewed) return aiInstructorLabel(review.ai_instructor_name);
  return humanName ? `講師　${humanName}` : null;
}
