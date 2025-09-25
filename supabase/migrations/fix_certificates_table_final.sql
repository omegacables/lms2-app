-- 証明書テーブルの最終修正
-- 既存のテーブルとポリシーを完全にクリーンアップして再作成

-- 既存のポリシーをすべて削除
DROP POLICY IF EXISTS "Users can view own certificates" ON public.certificates;
DROP POLICY IF EXISTS "Admins can view all certificates" ON public.certificates;
DROP POLICY IF EXISTS "System can insert certificates" ON public.certificates;
DROP POLICY IF EXISTS "Admins can update certificates" ON public.certificates;
DROP POLICY IF EXISTS "Admins can delete certificates" ON public.certificates;

-- RLSを一時的に無効化
ALTER TABLE IF EXISTS public.certificates DISABLE ROW LEVEL SECURITY;

-- テーブルが存在しない場合は作成
CREATE TABLE IF NOT EXISTS public.certificates (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  course_title TEXT NOT NULL,
  completion_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  pdf_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- カラムの追加・修正（テーブルが既に存在する場合）
DO $$
BEGIN
    -- id カラムをTEXT型に変更（必要な場合）
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'certificates'
        AND column_name = 'id'
        AND data_type != 'text'
    ) THEN
        -- 新しいIDカラムを追加
        ALTER TABLE public.certificates ADD COLUMN id_new TEXT;

        -- 既存のIDをコピー
        UPDATE public.certificates SET id_new = id::TEXT WHERE id_new IS NULL;

        -- 制約を一時的に削除
        ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_pkey;

        -- 古いIDカラムを削除して新しいものをリネーム
        ALTER TABLE public.certificates DROP COLUMN id;
        ALTER TABLE public.certificates RENAME COLUMN id_new TO id;

        -- プライマリキー制約を再追加
        ALTER TABLE public.certificates ADD PRIMARY KEY (id);
    END IF;

    -- is_active カラムが存在しない場合は追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'certificates'
        AND column_name = 'is_active'
    ) THEN
        ALTER TABLE public.certificates ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;

    -- user_name カラムが存在しない場合は追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'certificates'
        AND column_name = 'user_name'
    ) THEN
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
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'certificates'
        AND column_name = 'course_title'
    ) THEN
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
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'certificates'
        AND column_name = 'completion_date'
    ) THEN
        ALTER TABLE public.certificates ADD COLUMN completion_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
    END IF;

    -- pdf_url カラムが存在しない場合は追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'certificates'
        AND column_name = 'pdf_url'
    ) THEN
        ALTER TABLE public.certificates ADD COLUMN pdf_url TEXT;
    END IF;

    -- created_at カラムが存在しない場合は追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'certificates'
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.certificates ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
    END IF;

    -- 不要なカラムを削除（存在する場合）
    ALTER TABLE public.certificates DROP COLUMN IF EXISTS certificate_number;
    ALTER TABLE public.certificates DROP COLUMN IF EXISTS certificate_id;
    ALTER TABLE public.certificates DROP COLUMN IF EXISTS status;
    ALTER TABLE public.certificates DROP COLUMN IF EXISTS issued_at;
    ALTER TABLE public.certificates DROP COLUMN IF EXISTS updated_at;
    ALTER TABLE public.certificates DROP COLUMN IF EXISTS download_count;
END $$;

-- インデックスを作成（存在しない場合）
CREATE INDEX IF NOT EXISTS idx_certificates_user_id ON public.certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_course_id ON public.certificates(course_id);
CREATE INDEX IF NOT EXISTS idx_certificates_is_active ON public.certificates(is_active);
CREATE INDEX IF NOT EXISTS idx_certificates_created_at ON public.certificates(created_at DESC);

-- ユニーク制約を削除して再作成（重複を許可しない）
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS unique_user_course;
ALTER TABLE public.certificates ADD CONSTRAINT unique_user_course UNIQUE(user_id, course_id);

-- RLSを有効化
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- 新しいポリシーを作成（よりシンプルに）
-- 1. ユーザーは自分の証明書を閲覧可能
CREATE POLICY "Users can view own certificates"
ON public.certificates FOR SELECT
USING (auth.uid() = user_id);

-- 2. 管理者は全ての証明書を閲覧可能
CREATE POLICY "Admins can view all certificates"
ON public.certificates FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
);

-- 3. ユーザーは自分の証明書を作成可能
CREATE POLICY "Users can insert own certificates"
ON public.certificates FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 4. 管理者は全ての証明書を更新可能
CREATE POLICY "Admins can update all certificates"
ON public.certificates FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
);

-- 5. 管理者は全ての証明書を削除可能
CREATE POLICY "Admins can delete all certificates"
ON public.certificates FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
);

-- 証明書生成用の改良版関数
CREATE OR REPLACE FUNCTION public.generate_certificate_for_user(
  p_user_id UUID,
  p_course_id INTEGER
)
RETURNS TABLE(certificate_id TEXT, is_new BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_certificate_id TEXT;
  v_user_name TEXT;
  v_course_title TEXT;
  v_is_new BOOLEAN := FALSE;
BEGIN
  -- ユーザー名を取得
  SELECT COALESCE(display_name, email, 'Unknown User')
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
  WHERE user_id = p_user_id
  AND course_id = p_course_id;

  -- 証明書が存在しない場合は作成
  IF v_certificate_id IS NULL THEN
    v_certificate_id := gen_random_uuid()::TEXT;
    v_is_new := TRUE;

    INSERT INTO public.certificates (
      id,
      user_id,
      course_id,
      user_name,
      course_title,
      completion_date,
      is_active
    )
    VALUES (
      v_certificate_id,
      p_user_id,
      p_course_id,
      v_user_name,
      v_course_title,
      NOW(),
      TRUE
    )
    ON CONFLICT (user_id, course_id) DO UPDATE
    SET is_active = TRUE
    RETURNING id INTO v_certificate_id;
  END IF;

  RETURN QUERY SELECT v_certificate_id, v_is_new;
END;
$$;

-- テーブルのコメントを追加
COMMENT ON TABLE public.certificates IS '修了証明書テーブル';
COMMENT ON COLUMN public.certificates.id IS '証明書ID（UUID形式の文字列）';
COMMENT ON COLUMN public.certificates.user_id IS 'ユーザーID';
COMMENT ON COLUMN public.certificates.course_id IS 'コースID';
COMMENT ON COLUMN public.certificates.user_name IS 'ユーザー名（証明書発行時点）';
COMMENT ON COLUMN public.certificates.course_title IS 'コース名（証明書発行時点）';
COMMENT ON COLUMN public.certificates.completion_date IS '修了日';
COMMENT ON COLUMN public.certificates.pdf_url IS 'PDFファイルURL（オプション）';
COMMENT ON COLUMN public.certificates.is_active IS '有効フラグ';
COMMENT ON COLUMN public.certificates.created_at IS '作成日時';