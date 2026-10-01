import type { SupabaseClient } from '@supabase/supabase-js';

// 社労士（labor_consultant）が見てよい範囲＝担当会社の受講者だけ。
// 管理者・講師は制限なし（null を返す）。担当会社は labor_consultant_companies
// （stus-lms にだけあるテーブル。取得できないときは「担当なし＝何も見えない」として扱う）。

export type CompanyScope = Set<string> | null;

export async function consultantCompanyScope(
  admin: SupabaseClient,
  auth: { role: string; user: { id: string } }
): Promise<CompanyScope> {
  if (auth.role !== 'labor_consultant') return null;
  const { data, error } = await admin
    .from('labor_consultant_companies')
    .select('company')
    .eq('labor_consultant_id', auth.user.id);
  if (error) {
    console.error('[consultantScope] 担当会社の取得に失敗:', error);
    return new Set();
  }
  return new Set((data || []).map((r) => r.company).filter((c): c is string => !!c));
}

/** その会社の受講者を見てよいか（scope=null は制限なし） */
export function inScope(scope: CompanyScope, company: string | null | undefined): boolean {
  return scope === null || (!!company && scope.has(company));
}

/** 担当会社の受講者の id（1000件ずつ取得） */
export async function studentIdsInScope(admin: SupabaseClient, scope: Set<string>): Promise<string[]> {
  if (scope.size === 0) return [];
  const ids: string[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('user_profiles')
      .select('id')
      .in('company', Array.from(scope))
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('[consultantScope] 受講者の取得に失敗:', error);
      break;
    }
    (data || []).forEach((r) => ids.push(r.id));
    if (!data || data.length < PAGE) break;
  }
  return ids;
}

/** 配列を n 件ずつに分ける（.in() に大量の id を渡して URL が長くなりすぎないように） */
export function chunk<T>(items: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
