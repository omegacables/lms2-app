-- 証明書テーブルの最小限の修正（エラーを回避）

-- 1. まず既存のポリシーをすべて削除
DROP POLICY IF EXISTS "Users can view own certificates" ON public.certificates;
DROP POLICY IF EXISTS "Admins can view all certificates" ON public.certificates;
DROP POLICY IF EXISTS "System can insert certificates" ON public.certificates;
DROP POLICY IF EXISTS "Users can insert own certificates" ON public.certificates;
DROP POLICY IF EXISTS "Admins can update certificates" ON public.certificates;
DROP POLICY IF EXISTS "Admins can update all certificates" ON public.certificates;
DROP POLICY IF EXISTS "Admins can delete certificates" ON public.certificates;
DROP POLICY IF EXISTS "Admins can delete all certificates" ON public.certificates;

-- 2. 必要なカラムのみ追加（存在チェック付き）
DO $$
BEGIN
    -- is_active カラム
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'certificates'
        AND column_name = 'is_active'
    ) THEN
        ALTER TABLE public.certificates ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;

    -- user_name カラム
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'certificates'
        AND column_name = 'user_name'
    ) THEN
        ALTER TABLE public.certificates ADD COLUMN user_name TEXT;
        UPDATE public.certificates c
        SET user_name = COALESCE(
            (SELECT display_name FROM public.user_profiles WHERE id = c.user_id),
            (SELECT email FROM public.user_profiles WHERE id = c.user_id),
            'Unknown User'
        )
        WHERE user_name IS NULL;
        ALTER TABLE public.certificates ALTER COLUMN user_name SET NOT NULL;
    END IF;

    -- course_title カラム
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'certificates'
        AND column_name = 'course_title'
    ) THEN
        ALTER TABLE public.certificates ADD COLUMN course_title TEXT;
        UPDATE public.certificates c
        SET course_title = COALESCE(
            (SELECT title FROM public.courses WHERE id = c.course_id),
            'Unknown Course'
        )
        WHERE course_title IS NULL;
        ALTER TABLE public.certificates ALTER COLUMN course_title SET NOT NULL;
    END IF;

    -- completion_date カラム
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'certificates'
        AND column_name = 'completion_date'
    ) THEN
        ALTER TABLE public.certificates ADD COLUMN completion_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
        -- created_atがある場合はそれをコピー
        UPDATE public.certificates
        SET completion_date = COALESCE(created_at, NOW())
        WHERE completion_date IS NULL;
    END IF;

    -- pdf_url カラム
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'certificates'
        AND column_name = 'pdf_url'
    ) THEN
        ALTER TABLE public.certificates ADD COLUMN pdf_url TEXT;
    END IF;

    -- created_at カラム
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'certificates'
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.certificates ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
    END IF;
END $$;

-- 3. 不要なカラムを削除
ALTER TABLE public.certificates DROP COLUMN IF EXISTS certificate_number CASCADE;
ALTER TABLE public.certificates DROP COLUMN IF EXISTS certificate_id CASCADE;
ALTER TABLE public.certificates DROP COLUMN IF EXISTS status CASCADE;
ALTER TABLE public.certificates DROP COLUMN IF EXISTS issued_at CASCADE;
ALTER TABLE public.certificates DROP COLUMN IF EXISTS updated_at CASCADE;
ALTER TABLE public.certificates DROP COLUMN IF EXISTS download_count CASCADE;

-- 4. インデックスを作成（存在しない場合のみ）
CREATE INDEX IF NOT EXISTS idx_certificates_user_id ON public.certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_course_id ON public.certificates(course_id);
CREATE INDEX IF NOT EXISTS idx_certificates_is_active ON public.certificates(is_active);
CREATE INDEX IF NOT EXISTS idx_certificates_created_at ON public.certificates(created_at DESC);

-- 5. RLSを有効化
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- 6. 新しいポリシーを作成
CREATE POLICY "Users can view own certificates"
ON public.certificates FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all certificates"
ON public.certificates FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
);

CREATE POLICY "Users can insert own certificates"
ON public.certificates FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update all certificates"
ON public.certificates FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
);

CREATE POLICY "Admins can delete all certificates"
ON public.certificates FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
);

-- 7. 既存データの確認とクリーンアップ
UPDATE public.certificates SET is_active = TRUE WHERE is_active IS NULL;

-- 8. 現在のスキーマ状態を確認
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'certificates'
ORDER BY ordinal_position;

-- 9. 制約の確認
SELECT
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.certificates'::regclass;