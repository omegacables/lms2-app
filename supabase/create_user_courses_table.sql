-- user_coursesテーブルの作成
CREATE TABLE IF NOT EXISTS public.user_courses (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    due_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'overdue')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, course_id)
);

-- インデックスの作成
CREATE INDEX idx_user_courses_user_id ON public.user_courses(user_id);
CREATE INDEX idx_user_courses_course_id ON public.user_courses(course_id);
CREATE INDEX idx_user_courses_status ON public.user_courses(status);

-- RLS (Row Level Security) の有効化
ALTER TABLE public.user_courses ENABLE ROW LEVEL SECURITY;

-- RLSポリシーの作成
-- 管理者は全て見れる
CREATE POLICY "Admins can view all user_courses" ON public.user_courses
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'admin'
        )
    );

-- ユーザーは自分の割り当てのみ見れる
CREATE POLICY "Users can view own assignments" ON public.user_courses
    FOR SELECT
    USING (user_id = auth.uid());

-- 管理者は全て挿入できる
CREATE POLICY "Admins can insert user_courses" ON public.user_courses
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'admin'
        )
    );

-- 管理者は全て更新できる
CREATE POLICY "Admins can update user_courses" ON public.user_courses
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'admin'
        )
    );

-- 管理者は全て削除できる
CREATE POLICY "Admins can delete user_courses" ON public.user_courses
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'admin'
        )
    );

-- updated_atを自動更新するトリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_courses_updated_at
    BEFORE UPDATE ON public.user_courses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- コメント
COMMENT ON TABLE public.user_courses IS 'ユーザーへのコース割り当てを管理するテーブル';
COMMENT ON COLUMN public.user_courses.user_id IS '割り当てられたユーザーのID';
COMMENT ON COLUMN public.user_courses.course_id IS '割り当てられたコースのID';
COMMENT ON COLUMN public.user_courses.assigned_at IS 'コースが割り当てられた日時';
COMMENT ON COLUMN public.user_courses.assigned_by IS 'コースを割り当てた管理者のID';
COMMENT ON COLUMN public.user_courses.due_date IS 'コース完了期限（任意）';
COMMENT ON COLUMN public.user_courses.status IS '割り当て状態（assigned/in_progress/completed/overdue）';