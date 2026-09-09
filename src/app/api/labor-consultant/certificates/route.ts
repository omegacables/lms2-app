import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { requireLaborConsultant } from '@/lib/auth/requireLaborConsultant';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type CertificateRow = {
  id: string;
  user_id: string;
  course_id: number;
  user_name: string | null;
  course_title: string | null;
  completion_date: string;
  manual_issue_date: string | null;
  is_active: boolean;
};

function generateCertificateId(): string {
  const random = Math.random().toString(36).substring(2, 9).toUpperCase();
  return `CERT-${Date.now()}-${random}`;
}

/**
 * 対象の証明書が「自分の担当会社の生徒のもの」かを検証する。
 * admin は全件操作可。social insurance labor consultant は担当会社のみ。
 */
async function loadAuthorizedCertificate(
  adminClient: SupabaseClient,
  certificateId: string,
  consultantId: string,
  role: 'labor_consultant' | 'admin'
): Promise<{ ok: true; certificate: CertificateRow } | { ok: false; response: NextResponse }> {
  const { data: certificate, error } = await adminClient
    .from('certificates')
    .select('id, user_id, course_id, user_name, course_title, completion_date, manual_issue_date, is_active')
    .eq('id', certificateId)
    .maybeSingle();

  if (error) {
    console.error('[Labor Consultant Certificates] certificate fetch error:', error);
    return {
      ok: false,
      response: NextResponse.json(
        { error: '証明書の取得に失敗しました', details: error.message },
        { status: 500 }
      ),
    };
  }

  if (!certificate) {
    return { ok: false, response: NextResponse.json({ error: '証明書が見つかりません' }, { status: 404 }) };
  }

  if (role === 'admin') {
    return { ok: true, certificate: certificate as CertificateRow };
  }

  const { data: companiesData, error: companiesError } = await adminClient
    .from('labor_consultant_companies')
    .select('company')
    .eq('labor_consultant_id', consultantId);

  if (companiesError) {
    console.error('[Labor Consultant Certificates] companies error:', companiesError);
    return {
      ok: false,
      response: NextResponse.json(
        { error: '担当会社の取得に失敗しました', details: companiesError.message },
        { status: 500 }
      ),
    };
  }

  const companies = (companiesData ?? []).map((c) => c.company);
  if (companies.length === 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: '担当会社が割り当てられていません' }, { status: 403 }),
    };
  }

  const { data: student } = await adminClient
    .from('user_profiles')
    .select('id, company')
    .eq('id', certificate.user_id)
    .maybeSingle();

  if (!student || !student.company || !companies.includes(student.company)) {
    return {
      ok: false,
      response: NextResponse.json({ error: '担当外の生徒の証明書です' }, { status: 403 }),
    };
  }

  return { ok: true, certificate: certificate as CertificateRow };
}

// このシステムは JST 固定（要件定義 5.2）。サーバー(Vercel)は UTC で動くため、
// 日付の解釈・整形は必ず Asia/Tokyo を明示する。
// 既存の manual_issue_date は全件 JST 0時（= UTC 15:00）で保存されているので、それに合わせる。
const JST_DATE_FORMATTER = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 'YYYY-MM-DD' を JST 0時の ISO 文字列にする（不正な日付は null） */
function toIsoDate(input: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const date = new Date(`${input}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return null;
  // 2026-02-31 のような繰り上がりを弾く
  if (JST_DATE_FORMATTER.format(date) !== input) return null;
  return date.toISOString();
}

/** DB の date / timestamptz 値を JST 基準の 'YYYY-MM-DD' にする */
function toJstDateString(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return JST_DATE_FORMATTER.format(date);
}

/**
 * PATCH /api/labor-consultant/certificates
 * 終了日（修了日）の修正。
 * completion_date と manual_issue_date の両方を更新するため、
 * 一覧表示・PDF のどちらにも修正後の日付が反映される。
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireLaborConsultant(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const certificateId: string | undefined = body.certificateId;
    const completionDate: string | undefined = body.completionDate;

    if (!certificateId || !completionDate) {
      return NextResponse.json(
        { error: 'certificateId と completionDate は必須です' },
        { status: 400 }
      );
    }

    const isoDate = toIsoDate(completionDate);
    if (!isoDate) {
      return NextResponse.json({ error: '日付の形式が不正です（YYYY-MM-DD）' }, { status: 400 });
    }

    const adminClient = createAdminSupabaseClient();
    const guard = await loadAuthorizedCertificate(adminClient, certificateId, auth.user.id, auth.role);
    if (!guard.ok) return guard.response;

    const { data: updated, error: updateError } = await adminClient
      .from('certificates')
      .update({
        completion_date: completionDate,
        manual_issue_date: isoDate,
      })
      .eq('id', certificateId)
      .select('id, completion_date, manual_issue_date')
      .single();

    if (updateError) {
      console.error('[Labor Consultant Certificates] update error:', updateError);
      return NextResponse.json(
        { error: '終了日の更新に失敗しました', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, certificate: updated });
  } catch (error) {
    console.error('[Labor Consultant Certificates] PATCH unexpected error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/labor-consultant/certificates
 * 再発行。既存の証明書を削除し、新しい証明書番号で作り直す。
 * 終了日は指定があればそれを、無ければ既存の有効日付（手動設定日 > 修了日）を引き継ぐ。
 * ＝ 視聴ログからの再計算は行わないので、手動発行・日付修正済みの証明書でも日付が巻き戻らない。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireLaborConsultant(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const certificateId: string | undefined = body.certificateId;
    const completionDate: string | undefined = body.completionDate;

    if (!certificateId) {
      return NextResponse.json({ error: 'certificateId は必須です' }, { status: 400 });
    }

    const adminClient = createAdminSupabaseClient();
    const guard = await loadAuthorizedCertificate(adminClient, certificateId, auth.user.id, auth.role);
    if (!guard.ok) return guard.response;

    const existing = guard.certificate;

    // 終了日の決定: 明示指定 > 手動設定日 > 既存の修了日
    let effectiveDate: string;
    if (completionDate) {
      if (!toIsoDate(completionDate)) {
        return NextResponse.json({ error: '日付の形式が不正です（YYYY-MM-DD）' }, { status: 400 });
      }
      effectiveDate = completionDate;
    } else {
      // UTC で日付を切り出すと JST 0時保存の manual_issue_date が前日にズレるため JST で整形する
      const source = existing.manual_issue_date || existing.completion_date;
      const derived = toJstDateString(source);
      if (!derived) {
        return NextResponse.json({ error: '既存の証明書の日付が不正です' }, { status: 500 });
      }
      effectiveDate = derived;
    }
    const effectiveIso = toIsoDate(effectiveDate);
    if (!effectiveIso) {
      return NextResponse.json({ error: '終了日の変換に失敗しました' }, { status: 500 });
    }

    // 最新の氏名・コース名を反映する
    const { data: userProfile } = await adminClient
      .from('user_profiles')
      .select('display_name, email, company')
      .eq('id', existing.user_id)
      .maybeSingle();

    const { data: courseData } = await adminClient
      .from('courses')
      .select('title')
      .eq('id', existing.course_id)
      .maybeSingle();

    const { error: deleteError } = await adminClient
      .from('certificates')
      .delete()
      .eq('id', certificateId);

    if (deleteError) {
      console.error('[Labor Consultant Certificates] delete error:', deleteError);
      return NextResponse.json(
        { error: '既存の証明書の削除に失敗しました', details: deleteError.message },
        { status: 500 }
      );
    }

    const newCertificate = {
      id: generateCertificateId(),
      user_id: existing.user_id,
      course_id: existing.course_id,
      user_name: userProfile?.display_name || userProfile?.email || existing.user_name || 'ユーザー',
      course_title: courseData?.title || existing.course_title || 'コース名',
      completion_date: effectiveDate,
      manual_issue_date: effectiveIso,
      pdf_url: null,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    const { data: created, error: insertError } = await adminClient
      .from('certificates')
      .insert(newCertificate)
      .select('id, user_id, course_id, user_name, course_title, completion_date, manual_issue_date, is_active, created_at')
      .single();

    if (insertError) {
      console.error('[Labor Consultant Certificates] insert error:', insertError);
      // 削除済みなので、元の内容で復元を試みる
      await adminClient.from('certificates').insert({
        id: existing.id,
        user_id: existing.user_id,
        course_id: existing.course_id,
        user_name: existing.user_name,
        course_title: existing.course_title,
        completion_date: existing.completion_date,
        manual_issue_date: existing.manual_issue_date,
        pdf_url: null,
        is_active: existing.is_active,
        created_at: new Date().toISOString(),
      });
      return NextResponse.json(
        { error: '新しい証明書の作成に失敗しました（元の証明書を復元しました）', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, certificate: created, previousId: existing.id });
  } catch (error) {
    console.error('[Labor Consultant Certificates] POST unexpected error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
