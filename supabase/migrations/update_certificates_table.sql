-- 証明書テーブルの更新（既存のテーブルがある場合）

-- 既存のポリシーを削除（存在する場合）
DROP POLICY IF EXISTS "Users can view own certificates" ON public.certificates;
DROP POLICY IF EXISTS "Admins can view all certificates" ON public.certificates;
DROP POLICY IF EXISTS "System can insert certificates" ON public.certificates;
DROP POLICY IF EXISTS "Admins can update certificates" ON public.certificates;
DROP POLICY IF EXISTS "Admins can delete certificates" ON public.certificates;

-- カラムが存在しない場合は追加
DO $$
BEGIN
    -- is_active カラムが存在しない場合は追加
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                   AND table_name = 'certificates'
                   AND column_name = 'is_active') THEN
        ALTER TABLE public.certificates ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;

    -- user_name カラムが存在しない場合は追加
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                   AND table_name = 'certificates'
                   AND column_name = 'user_name') THEN
        ALTER TABLE public.certificates ADD COLUMN user_name TEXT;

        -- 既存データのuser_nameを更新
        UPDATE public.certificates c
        SET user_name = COALESCE(up.display_name, up.email, 'Unknown User')
        FROM public.user_profiles up
        WHERE c.user_id = up.id
        AND c.user_name IS NULL;

        -- NOT NULL制約を追加
        ALTER TABLE public.certificates ALTER COLUMN user_name SET NOT NULL;
    END IF;

    -- course_title カラムが存在しない場合は追加
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                   AND table_name = 'certificates'
                   AND column_name = 'course_title') THEN
        ALTER TABLE public.certificates ADD COLUMN course_title TEXT;

        -- 既存データのcourse_titleを更新
        UPDATE public.certificates c
        SET course_title = co.title
        FROM public.courses co
        WHERE c.course_id = co.id
        AND c.course_title IS NULL;

        -- NOT NULL制約を追加
        ALTER TABLE public.certificates ALTER COLUMN course_title SET NOT NULL;
    END IF;

    -- completion_date カラムが存在しない場合は追加
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                   AND table_name = 'certificates'
                   AND column_name = 'completion_date') THEN
        ALTER TABLE public.certificates ADD COLUMN completion_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
    END IF;

    -- pdf_url カラムが存在しない場合は追加
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                   AND table_name = 'certificates'
                   AND column_name = 'pdf_url') THEN
        ALTER TABLE public.certificates ADD COLUMN pdf_url TEXT;
    END IF;

    -- created_at カラムが存在しない場合は追加
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                   AND table_name = 'certificates'
                   AND column_name = 'created_at') THEN
        ALTER TABLE public.certificates ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
    END IF;

    -- 不要なカラムがあれば削除（例：status, issued_at, certificate_number など）
    -- これらは安全のためコメントアウトしています。必要に応じて有効化してください
    -- ALTER TABLE public.certificates DROP COLUMN IF EXISTS status;
    -- ALTER TABLE public.certificates DROP COLUMN IF EXISTS issued_at;
    -- ALTER TABLE public.certificates DROP COLUMN IF EXISTS certificate_number;
    -- ALTER TABLE public.certificates DROP COLUMN IF EXISTS certificate_id;
    -- ALTER TABLE public.certificates DROP COLUMN IF EXISTS updated_at;
    -- ALTER TABLE public.certificates DROP COLUMN IF EXISTS download_count;
END $$;

-- インデックスを作成（存在しない場合）
CREATE INDEX IF NOT EXISTS idx_certificates_user_id ON public.certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_course_id ON public.certificates(course_id);
CREATE INDEX IF NOT EXISTS idx_certificates_is_active ON public.certificates(is_active);
CREATE INDEX IF NOT EXISTS idx_certificates_created_at ON public.certificates(created_at DESC);

-- ユニーク制約を追加（存在しない場合）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'unique_user_course') THEN
        ALTER TABLE public.certificates
        ADD CONSTRAINT unique_user_course UNIQUE(user_id, course_id);
    END IF;
END $$;

-- RLS（Row Level Security）を有効化
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- 新しいポリシーを作成
CREATE POLICY "Users can view own certificates" ON public.certificates
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all certificates" ON public.certificates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "System can insert certificates" ON public.certificates
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update certificates" ON public.certificates
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete certificates" ON public.certificates
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- 既存データの移行（statusカラムがある場合、is_activeに移行）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public'
               AND table_name = 'certificates'
               AND column_name = 'status') THEN
        UPDATE public.certificates
        SET is_active = CASE
            WHEN status = 'active' THEN TRUE
            WHEN status = 'revoked' THEN FALSE
            ELSE TRUE
        END
        WHERE is_active IS NULL;
    END IF;
END $$;

-- 証明書生成用の関数を更新
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
      user_id, course_id, user_name, course_title, completion_date, is_active
    )
    VALUES (
      p_user_id, p_course_id, v_user_name, v_course_title, NOW(), TRUE
    )
    RETURNING id INTO v_certificate_id;
  END IF;

  RETURN v_certificate_id;
END;
$$;