import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

// コース割り当て一覧を取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createAdminSupabaseClient();
    const { id: userId } = await params;

    // ユーザーに割り当てられたコースを取得
    const { data: assignedCourses, error } = await supabase
      .from('user_course_assignments')
      .select('*')
      .eq('user_id', userId)
      .order('assigned_at', { ascending: false });

    if (error) {
      throw error;
    }

    // 各コースの詳細情報を取得
    const courseIds = assignedCourses?.map(a => a.course_id) || [];
    let coursesInfo = {};

    if (courseIds.length > 0) {
      const { data: coursesData } = await supabase
        .from('courses')
        .select('id, title, description, category, difficulty_level, estimated_duration, thumbnail_url')
        .in('id', courseIds);

      // IDをキーとしたマップを作成
      coursesInfo = (coursesData || []).reduce((acc, course) => {
        acc[course.id] = course;
        return acc;
      }, {});
    }

    // 各コースの進捗を取得
    const coursesWithProgress = await Promise.all(
      (assignedCourses || []).map(async (assignment) => {
        // コースの動画数を取得
        const { data: videos } = await supabase
          .from('videos')
          .select('id')
          .eq('course_id', assignment.course_id)
          .eq('status', 'active');

        const totalVideos = videos?.length || 0;

        // 完了した動画数を取得
        const { data: completedVideos } = await supabase
          .from('video_view_logs')
          .select('video_id')
          .eq('user_id', userId)
          .eq('course_id', assignment.course_id)
          .eq('status', 'completed');

        const videosCompleted = completedVideos?.length || 0;

        // 最後のアクセス日時を取得
        const { data: lastAccess } = await supabase
          .from('video_view_logs')
          .select('last_updated')
          .eq('user_id', userId)
          .eq('course_id', assignment.course_id)
          .order('last_updated', { ascending: false })
          .limit(1)
          .single();

        const progress = totalVideos > 0 
          ? Math.round((videosCompleted / totalVideos) * 100)
          : 0;

        const courseInfo = coursesInfo[assignment.course_id] || {};

        return {
          ...assignment,
          progress,
          videos_completed: videosCompleted,
          total_videos: totalVideos,
          last_accessed: lastAccess?.last_updated || null,
          course_title: courseInfo.title || '',
          course_info: courseInfo,
          courses: courseInfo // For backward compatibility
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: coursesWithProgress
    });

  } catch (error) {
    console.error('Error fetching assigned courses:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch assigned courses' 
      },
      { status: 500 }
    );
  }
}

// コースを割り当て
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createAdminSupabaseClient();
    const { id: userId } = await params;
    const { courseIds, assignedBy } = await request.json();

    if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Course IDs are required' 
        },
        { status: 400 }
      );
    }

    // 既に割り当てられているコースを確認
    const { data: existingAssignments } = await supabase
      .from('user_course_assignments')
      .select('course_id')
      .eq('user_id', userId)
      .in('course_id', courseIds);

    const existingCourseIds = existingAssignments?.map(a => a.course_id) || [];
    const newCourseIds = courseIds.filter(id => !existingCourseIds.includes(id));

    if (newCourseIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All courses are already assigned',
        assigned: 0
      });
    }

    // 新しいコースを割り当て
    const assignments = newCourseIds.map(courseId => ({
      user_id: userId,
      course_id: courseId,
      assigned_by: assignedBy || null,
      assigned_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('user_course_assignments')
      .insert(assignments)
      .select();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: `${newCourseIds.length} courses assigned successfully`,
      assigned: newCourseIds.length,
      data
    });

  } catch (error) {
    console.error('Error assigning courses:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to assign courses' 
      },
      { status: 500 }
    );
  }
}

// コース割り当てを削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createAdminSupabaseClient();
    const { id: userId } = await params;
    const { courseId } = await request.json();

    if (!courseId) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Course ID is required' 
        },
        { status: 400 }
      );
    }

    // コース割り当てを削除
    const { error } = await supabase
      .from('user_course_assignments')
      .delete()
      .eq('user_id', userId)
      .eq('course_id', courseId);

    if (error) {
      throw error;
    }

    // オプション: 関連する視聴ログも削除する場合
    // await supabase
    //   .from('video_view_logs')
    //   .delete()
    //   .eq('user_id', userId)
    //   .eq('course_id', courseId);

    return NextResponse.json({
      success: true,
      message: 'Course assignment removed successfully'
    });

  } catch (error) {
    console.error('Error removing course assignment:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to remove course assignment' 
      },
      { status: 500 }
    );
  }
}