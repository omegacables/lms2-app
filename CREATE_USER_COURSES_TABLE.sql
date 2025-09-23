-- ============================================================
-- user_coursesテーブル作成SQL
-- 
-- このSQLをSupabase SQL Editorで実行してください
-- ============================================================

-- 1. テーブル作成
CREATE TABLE IF NOT EXISTS public.user_courses (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    course_id INTEGER NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_by UUID,
    due_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'assigned',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 外部キー制約を追加（auth.usersテーブルが存在する場合）
ALTER TABLE public.user_courses 
    ADD CONSTRAINT fk_user_courses_user 
    FOREIGN KEY (user_id) 
    REFERENCES auth.users(id) 
    ON DELETE CASCADE;

-- 3. 外部キー制約を追加（coursesテーブルが存在する場合）
ALTER TABLE public.user_courses 
    ADD CONSTRAINT fk_user_courses_course 
    FOREIGN KEY (course_id) 
    REFERENCES public.courses(id) 
    ON DELETE CASCADE;

-- 4. ユニーク制約を追加（同じユーザーに同じコースを重複割り当てしない）
ALTER TABLE public.user_courses 
    ADD CONSTRAINT unique_user_course 
    UNIQUE(user_id, course_id);

-- 5. インデックスの作成（検索性能向上）
CREATE INDEX IF NOT EXISTS idx_user_courses_user_id ON public.user_courses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_courses_course_id ON public.user_courses(course_id);
CREATE INDEX IF NOT EXISTS idx_user_courses_status ON public.user_courses(status);

-- 6. RLS (Row Level Security) を有効化
ALTER TABLE public.user_courses ENABLE ROW LEVEL SECURITY;

-- 7. RLSポリシーを作成（Service Roleは全権限）
CREATE POLICY "Service role can do everything" 
ON public.user_courses 
FOR ALL 
TO service_role
USING (true)
WITH CHECK (true);

-- 8. RLSポリシーを作成（管理者は全て見れる）
CREATE POLICY "Admins can view all user_courses" 
ON public.user_courses
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
);

-- 9. RLSポリシーを作成（管理者は挿入・更新・削除できる）
CREATE POLICY "Admins can manage user_courses" 
ON public.user_courses
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
);

-- 10. RLSポリシーを作成（ユーザーは自分の割り当てのみ見れる）
CREATE POLICY "Users can view own assignments" 
ON public.user_courses
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 11. updated_atを自動更新するトリガー関数
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 12. updated_atトリガーを設定
DROP TRIGGER IF EXISTS update_user_courses_updated_at ON public.user_courses;
CREATE TRIGGER update_user_courses_updated_at
    BEFORE UPDATE ON public.user_courses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- 13. テーブルとカラムにコメントを追加
COMMENT ON TABLE public.user_courses IS 'ユーザーへのコース割り当てを管理するテーブル';
COMMENT ON COLUMN public.user_courses.id IS '主キー';
COMMENT ON COLUMN public.user_courses.user_id IS '割り当てられたユーザーのID';
COMMENT ON COLUMN public.user_courses.course_id IS '割り当てられたコースのID';
COMMENT ON COLUMN public.user_courses.assigned_at IS 'コースが割り当てられた日時';
COMMENT ON COLUMN public.user_courses.assigned_by IS 'コースを割り当てた管理者のID';
COMMENT ON COLUMN public.user_courses.due_date IS 'コース完了期限（任意）';
COMMENT ON COLUMN public.user_courses.status IS '割り当て状態（assigned/in_progress/completed/overdue）';
COMMENT ON COLUMN public.user_courses.created_at IS 'レコード作成日時';
COMMENT ON COLUMN public.user_courses.updated_at IS 'レコード更新日時';

-- 14. テーブルが正しく作成されたか確認
SELECT 
    'user_courses table created successfully' as message,
    count(*) as row_count
FROM public.user_courses;