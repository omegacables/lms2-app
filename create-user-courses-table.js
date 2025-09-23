const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://tjzdsiaehksqpxuvzqvp.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqemRzaWFlaGtzcXB4dXZ6cXZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDM1ODMzNiwiZXhwIjoyMDY5OTM0MzM2fQ.AOxvhPfOhZs1W7dKjJLKG--AALZxOkR9OGP_vbM1LZU';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function createUserCoursesTable() {
  console.log('Creating user_courses table...\n');
  
  try {
    // テーブル作成
    const { error: createError } = await supabase.rpc('exec_sql', {
      sql: `
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
      `
    });
    
    if (createError) {
      console.log('Note: Table might already exist or RPC not available');
      console.log('Please run the SQL manually in Supabase SQL Editor:\n');
      console.log('='.repeat(60));
      console.log(`
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

-- Service Role Keyを使用する場合はRLSをバイパスできるポリシーを追加
CREATE POLICY "Service role can do everything" ON public.user_courses
    FOR ALL
    USING (auth.role() = 'service_role');

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
      `);
      console.log('='.repeat(60));
      console.log('\nPlease copy the SQL above and run it in Supabase Dashboard:');
      console.log('1. Go to https://supabase.com/dashboard');
      console.log('2. Select your project');
      console.log('3. Navigate to SQL Editor');
      console.log('4. Paste and run the SQL\n');
    } else {
      console.log('Table created successfully!');
    }
    
    // テーブルの存在確認
    const { data: testData, error: testError } = await supabase
      .from('user_courses')
      .select('*')
      .limit(1);
    
    if (testError) {
      console.log('\n❌ Table check failed:', testError.message);
      console.log('\nPlease create the table manually using the SQL above.');
    } else {
      console.log('\n✅ Table exists and is accessible!');
      
      // テスト割り当てを作成
      console.log('\nCreating test assignment...');
      
      // 安藤蓮のIDを取得
      const { data: user } = await supabase
        .from('user_profiles')
        .select('id')
        .like('display_name', '%安藤%')
        .single();
      
      // アクティブなコースを取得
      const { data: course } = await supabase
        .from('courses')
        .select('id')
        .eq('status', 'active')
        .limit(1)
        .single();
      
      if (user && course) {
        // 既存の割り当てを確認
        const { data: existing } = await supabase
          .from('user_courses')
          .select('id')
          .eq('user_id', user.id)
          .eq('course_id', course.id)
          .single();
        
        if (!existing) {
          const { data: newAssignment, error: assignError } = await supabase
            .from('user_courses')
            .insert({
              user_id: user.id,
              course_id: course.id,
              status: 'assigned'
            })
            .select()
            .single();
          
          if (assignError) {
            console.log('Assignment error:', assignError);
          } else {
            console.log('✅ Test assignment created:', newAssignment);
          }
        } else {
          console.log('Assignment already exists for this user and course');
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

createUserCoursesTable();