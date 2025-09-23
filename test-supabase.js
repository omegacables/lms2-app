const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://tjzdsiaehksqpxuvzqvp.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqemRzaWFlaGtzcXB4dXZ6cXZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDM1ODMzNiwiZXhwIjoyMDY5OTM0MzM2fQ.AOxvhPfOhZs1W7dKjJLKG--AALZxOkR9OGP_vbM1LZU';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function testConnection() {
  console.log('Testing Supabase connection...');
  
  try {
    // user_coursesテーブルをテスト
    console.log('\n1. Testing user_courses table:');
    const { data: userCourses, error: ucError } = await supabase
      .from('user_courses')
      .select('*')
      .limit(3);
    
    if (ucError) {
      console.error('user_courses error:', ucError);
    } else {
      console.log('user_courses count:', userCourses?.length || 0);
      if (userCourses && userCourses.length > 0) {
        console.log('Sample data:', userCourses[0]);
      }
    }
    
    // 安藤蓮を検索
    console.log('\n2. Searching for 安藤蓮:');
    const { data: users, error: userError } = await supabase
      .from('user_profiles')
      .select('id, display_name, company')
      .like('display_name', '%安藤%');
    
    if (userError) {
      console.error('User search error:', userError);
    } else if (users && users.length > 0) {
      console.log('Found user:', users[0]);
      
      // 安藤蓮のコース割り当てを確認
      const userId = users[0].id;
      console.log('\n3. Checking course assignments for user:', userId);
      
      const { data: assignments, error: assignError } = await supabase
        .from('user_courses')
        .select('*')
        .eq('user_id', userId);
      
      if (assignError) {
        console.error('Assignment error:', assignError);
      } else {
        console.log('Assigned courses count:', assignments?.length || 0);
        if (assignments && assignments.length > 0) {
          console.log('Assignments:', assignments);
        }
      }
    } else {
      console.log('User not found');
    }
    
    // コース一覧を取得
    console.log('\n4. Getting courses:');
    const { data: courses, error: courseError } = await supabase
      .from('courses')
      .select('id, title, status')
      .eq('status', 'active')
      .limit(3);
    
    if (courseError) {
      console.error('Course error:', courseError);
    } else {
      console.log('Active courses:', courses?.length || 0);
      if (courses && courses.length > 0) {
        console.log('Sample course:', courses[0]);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testConnection();