const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://tjzdsiaehksqpxuvzqvp.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqemRzaWFlaGtzcXB4dXZ6cXZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDM1ODMzNiwiZXhwIjoyMDY5OTM0MzM2fQ.AOxvhPfOhZs1W7dKjJLKG--AALZxOkR9OGP_vbM1LZU';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function createTestCourse() {
  console.log('Creating test course...\n');
  
  try {
    // 新しいコースを作成
    const { data: newCourse, error: createError } = await supabase
      .from('courses')
      .insert({
        title: 'JavaScript基礎講座',
        description: 'JavaScriptの基本を学ぶコースです',
        category: 'Programming',
        difficulty_level: 'beginner',
        status: 'active',
        estimated_duration: 120,
        completion_threshold: 80
      })
      .select()
      .single();
    
    if (createError) {
      console.error('Course creation error:', createError);
      return;
    }
    
    console.log('✅ Course created successfully!');
    console.log('Course details:', newCourse);
    
    // 全コースを表示
    const { data: allCourses } = await supabase
      .from('courses')
      .select('id, title, status')
      .eq('status', 'active');
    
    console.log('\nAll active courses:');
    allCourses.forEach(course => {
      console.log(`- ID: ${course.id}, Title: ${course.title}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

createTestCourse();