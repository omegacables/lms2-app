-- 証明書テーブルの作成
CREATE TABLE IF NOT EXISTS public.certificates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  course_title TEXT NOT NULL,
  completion_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  pdf_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- インデックス用
  CONSTRAINT unique_user_course UNIQUE(user_id, course_id)
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_certificates_user_id ON public.certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_course_id ON public.certificates(course_id);
CREATE INDEX IF NOT EXISTS idx_certificates_is_active ON public.certificates(is_active);
CREATE INDEX IF NOT EXISTS idx_certificates_created_at ON public.certificates(created_at DESC);

-- RLS（Row Level Security）を有効化
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- ユーザーが自分の証明書を見ることができるポリシー
CREATE POLICY "Users can view own certificates" ON public.certificates
  FOR SELECT
  USING (auth.uid() = user_id);

-- 管理者は全ての証明書を見ることができるポリシー
CREATE POLICY "Admins can view all certificates" ON public.certificates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- システムが証明書を作成できるポリシー（サービスロールキー経由）
CREATE POLICY "System can insert certificates" ON public.certificates
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 管理者が証明書を更新できるポリシー
CREATE POLICY "Admins can update certificates" ON public.certificates
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- 管理者が証明書を削除できるポリシー
CREATE POLICY "Admins can delete certificates" ON public.certificates
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- 証明書生成用の関数（オプション）
CREATE OR REPLACE FUNCTION public.generate_certificate(
  p_user_id UUID,
  p_course_id INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_certificate_id TEXT;
  v_user_name TEXT;
  v_course_title TEXT;
BEGIN
  -- ユーザー名を取得
  SELECT COALESCE(display_name, email)
  INTO v_user_name
  FROM public.user_profiles
  WHERE id = p_user_id;

  -- コース名を取得
  SELECT title
  INTO v_course_title
  FROM public.courses
  WHERE id = p_course_id;

  -- 既存の証明書をチェック
  SELECT id INTO v_certificate_id
  FROM public.certificates
  WHERE user_id = p_user_id AND course_id = p_course_id;

  -- 証明書が存在しない場合は作成
  IF v_certificate_id IS NULL THEN
    INSERT INTO public.certificates (
      user_id, course_id, user_name, course_title, completion_date
    )
    VALUES (
      p_user_id, p_course_id, v_user_name, v_course_title, NOW()
    )
    RETURNING id INTO v_certificate_id;
  END IF;

  RETURN v_certificate_id;
END;
$$;