-- 証明書テーブルに手動発行日カラムを追加
-- 手動で設定された場合、この日付がPDFに記載される「発行日」として優先される

ALTER TABLE public.certificates
ADD COLUMN IF NOT EXISTS manual_issue_date TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- インデックスを追加
CREATE INDEX IF NOT EXISTS idx_certificates_manual_issue_date ON public.certificates(manual_issue_date);

-- 社労士がinstructorロールで証明書を更新できるようにRLSポリシーを追加
DROP POLICY IF EXISTS "Instructors can update certificates for assigned companies" ON public.certificates;
CREATE POLICY "Instructors can update certificates for assigned companies" ON public.certificates
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      JOIN public.labor_consultant_companies lcc ON lcc.labor_consultant_id = up.id
      JOIN public.user_profiles student_profile ON student_profile.company = lcc.company
      WHERE up.id = auth.uid()
      AND up.role = 'instructor'
      AND student_profile.id = certificates.user_id
    )
  );
