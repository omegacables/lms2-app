import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { requireAdmin } from '@/lib/auth/requireAdmin';

/**
 * 会社名のリネーム（または既存の会社へのマージ）。
 * - user_profiles.company と labor_consultant_companies.company を一括更新
 * - 統合先がすでに存在する場合は labor_consultant_companies の重複を解消
 * - company_settings（会社ごとの研修期間）も新しい会社名へ引き継ぐ（統合先に設定があればそちらを残す）
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const fromRaw = body?.from;
    const toRaw = body?.to;

    if (!fromRaw || typeof fromRaw !== 'string' || !fromRaw.trim()) {
      return NextResponse.json({ error: '変更元の会社名が指定されていません' }, { status: 400 });
    }
    if (!toRaw || typeof toRaw !== 'string' || !toRaw.trim()) {
      return NextResponse.json({ error: '変更先の会社名が指定されていません' }, { status: 400 });
    }

    const from = fromRaw.trim();
    const to = toRaw.trim();

    if (from === to) {
      return NextResponse.json({ error: '変更元と変更先が同じです' }, { status: 400 });
    }

    const adminClient = createAdminSupabaseClient();

    // 1. user_profiles の company を一括更新
    const { data: updatedProfiles, error: profileError } = await adminClient
      .from('user_profiles')
      .update({ company: to })
      .eq('company', from)
      .select('id');

    if (profileError) {
      console.error('[Company Rename] profile update error:', profileError);
      return NextResponse.json(
        {
          error: 'ユーザープロフィールの更新に失敗しました',
          details: profileError.message,
        },
        { status: 500 }
      );
    }

    const updatedProfileCount = updatedProfiles?.length ?? 0;

    // 2. labor_consultant_companies の更新 / 重複統合
    // 「from を担当している社労士」と「to を担当している社労士」の集合を取り、
    // 重複を避けつつ統合先 (to) に書き換える
    let lccUpdated = 0;
    let lccMerged = 0;

    try {
      // from を担当している社労士一覧
      const { data: fromMappings } = await adminClient
        .from('labor_consultant_companies')
        .select('labor_consultant_id')
        .eq('company', from);

      const fromConsultantIds = (fromMappings ?? []).map(r => r.labor_consultant_id);

      if (fromConsultantIds.length > 0) {
        // to で既に存在するマッピング
        const { data: toMappings } = await adminClient
          .from('labor_consultant_companies')
          .select('labor_consultant_id')
          .eq('company', to)
          .in('labor_consultant_id', fromConsultantIds);

        const alreadyMappedSet = new Set(
          (toMappings ?? []).map(r => r.labor_consultant_id)
        );

        // すでに to も担当している → from の行を削除（重複防止）
        const duplicateIds = fromConsultantIds.filter(id => alreadyMappedSet.has(id));
        if (duplicateIds.length > 0) {
          const { error: dupDeleteError } = await adminClient
            .from('labor_consultant_companies')
            .delete()
            .eq('company', from)
            .in('labor_consultant_id', duplicateIds);
          if (!dupDeleteError) lccMerged = duplicateIds.length;
        }

        // 残りは to にリネーム
        const remainingIds = fromConsultantIds.filter(id => !alreadyMappedSet.has(id));
        if (remainingIds.length > 0) {
          const { error: renameError } = await adminClient
            .from('labor_consultant_companies')
            .update({ company: to })
            .eq('company', from)
            .in('labor_consultant_id', remainingIds);
          if (!renameError) lccUpdated = remainingIds.length;
        }
      }
    } catch (e) {
      console.warn('[Company Rename] labor_consultant_companies cleanup warning:', e);
    }

    // 3. company_settings（会社ごとの研修期間など）を新しい会社名へ引き継ぐ。
    // 変更先にすでに設定があればそちらを残し、変更元の行は消す（表がまだ無い環境では何もしない）
    let companySettings: 'none' | 'moved' | 'kept_target' = 'none';
    try {
      const { data: fromSetting } = await adminClient
        .from('company_settings')
        .select('company')
        .eq('company', from)
        .maybeSingle();

      if (fromSetting) {
        const { data: toSetting } = await adminClient
          .from('company_settings')
          .select('company')
          .eq('company', to)
          .maybeSingle();

        if (toSetting) {
          const { error } = await adminClient.from('company_settings').delete().eq('company', from);
          if (error) console.warn('[Company Rename] company_settings cleanup warning:', error.message);
          else companySettings = 'kept_target';
        } else {
          const { error } = await adminClient.from('company_settings').update({ company: to }).eq('company', from);
          if (error) console.warn('[Company Rename] company_settings rename warning:', error.message);
          else companySettings = 'moved';
        }
      }
    } catch (e) {
      console.warn('[Company Rename] company_settings warning:', e);
    }

    return NextResponse.json({
      success: true,
      from,
      to,
      updatedProfiles: updatedProfileCount,
      laborConsultantMappingsRenamed: lccUpdated,
      laborConsultantMappingsMerged: lccMerged,
      companySettings,
      message:
        updatedProfileCount > 0
          ? `${updatedProfileCount}名のユーザーを「${to}」に統合しました`
          : `「${from}」に該当するユーザーはいませんでした（社労士マッピングのみ更新）`,
    });
  } catch (error) {
    console.error('[Company Rename] unexpected error:', error);
    return NextResponse.json(
      {
        error: '会社名変更中にエラーが発生しました',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
