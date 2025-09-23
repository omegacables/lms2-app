const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://tjzdsiaehksqpxuvzqvp.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqemRzaWFlaGtzcXB4dXZ6cXZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDM1ODMzNiwiZXhwIjoyMDY5OTM0MzM2fQ.AOxvhPfOhZs1W7dKjJLKG--AALZxOkR9OGP_vbM1LZU';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function assignCourse() {
  console.log('Testing course assignment...\n');
  
  try {
    // 安藤蓮のIDを取得
    const { data: user, error: userError } = await supabase
      .from('user_profiles')
      .select('id, display_name')
      .like('display_name', '%安藤%')
      .single();
    
    if (userError) {
      console.error('User search error:', userError);
      return;
    }
    
    console.log('Found user:', user);
    
    // アクティブなコースを取得
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, title')
      .eq('status', 'active')
      .limit(1)
      .single();
    
    if (courseError) {
      console.error('Course search error:', courseError);
      return;
    }
    
    console.log('Found course:', course);
    
    // 既存の割り当てを確認
    const { data: existing, error: existingError } = await supabase
      .from('user_courses')
      .select('*')
      .eq('user_id', user.id)
      .eq('course_id', course.id)
      .single();
    
    if (existing) {
      console.log('\n❌ This course is already assigned to this user:', existing);
      return;
    }
    
    // コースを割り当て
    console.log('\nAssigning course to user...');
    const { data: newAssignment, error: assignError } = await supabase
      .from('user_courses')
      .insert({
        user_id: user.id,
        course_id: course.id,
        status: 'assigned',
        assigned_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (assignError) {
      console.error('Assignment error:', assignError);
      return;
    }
    
    console.log('\n✅ Course assigned successfully!');
    console.log('Assignment details:', newAssignment);
    
    // 確認のため、再度取得
    const { data: allAssignments, error: fetchError } = await supabase
      .from('user_courses')
      .select('*')
      .eq('user_id', user.id);
    
    if (!fetchError) {
      console.log('\nTotal assignments for this user:', allAssignments.length);
      console.log('All assignments:', allAssignments);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

assignCourse();