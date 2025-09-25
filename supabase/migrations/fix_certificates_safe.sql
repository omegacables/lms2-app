-- 証明書テーブルの安全な修正（既存の制約を考慮）

-- 既存のポリシーをすべて削除
DROP POLICY IF EXISTS "Users can view own certificates" ON public.certificates;
DROP POLICY IF EXISTS "Admins can view all certificates" ON public.certificates;
DROP POLICY IF EXISTS "System can insert certificates" ON public.certificates;
DROP POLICY IF EXISTS "Users can insert own certificates" ON public.certificates;
DROP POLICY IF EXISTS "Admins can update certificates" ON public.certificates;
DROP POLICY IF EXISTS "Admins can update all certificates" ON public.certificates;
DROP POLICY IF EXISTS "Admins can delete certificates" ON public.certificates;
DROP POLICY IF EXISTS "Admins can delete all certificates" ON public.certificates;

-- カラムの追加・修正（テーブルが既に存在する場合）
DO $$
BEGIN
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

        -- user_nameに値が入ったらNOT NULL制約を追加
        UPDATE public.certificates SET user_name = 'Unknown User' WHERE user_name IS NULL;
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

        -- course_titleに値が入ったらNOT NULL制約を追加
        UPDATE public.certificates SET course_title = 'Unknown Course' WHERE course_title IS NULL;
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
END $$;

-- 不要なカラムを削除（存在する場合）
ALTER TABLE public.certificates DROP COLUMN IF EXISTS certificate_number CASCADE;
ALTER TABLE public.certificates DROP COLUMN IF EXISTS certificate_id CASCADE;
ALTER TABLE public.certificates DROP COLUMN IF EXISTS status CASCADE;
ALTER TABLE public.certificates DROP COLUMN IF EXISTS issued_at CASCADE;
ALTER TABLE public.certificates DROP COLUMN IF EXISTS updated_at CASCADE;
ALTER TABLE public.certificates DROP COLUMN IF EXISTS download_count CASCADE;

-- インデックスを作成（存在しない場合）
CREATE INDEX IF NOT EXISTS idx_certificates_user_id ON public.certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_course_id ON public.certificates(course_id);
CREATE INDEX IF NOT EXISTS idx_certificates_is_active ON public.certificates(is_active);
CREATE INDEX IF NOT EXISTS idx_certificates_created_at ON public.certificates(created_at DESC);

-- ユニーク制約が存在しない場合のみ追加
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_user_course'
        AND conrelid = 'public.certificates'::regclass
    ) THEN
        ALTER TABLE public.certificates
        ADD CONSTRAINT unique_user_course UNIQUE(user_id, course_id);
    END IF;
END $$;

-- RLSを有効化
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- 新しいポリシーを作成
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

-- 既存データのis_activeを確実にTRUEに設定
UPDATE public.certificates SET is_active = TRUE WHERE is_active IS NULL;

-- id カラムがINTEGERやBIGINTの場合、TEXT型への変換はデータ移行が必要なため、
-- 別途実行することを推奨します。現在のIDタイプを確認してください。
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'certificates'
AND column_name = 'id';