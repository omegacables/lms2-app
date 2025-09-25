import { supabase } from '@/lib/database/supabase';
import { generateCertificateId } from '@/lib/utils';

/**
 * コース完了時に証明書を自動生成
 */
export async function autoGenerateCertificate(
  userId: string,
  courseId: number
): Promise<{ success: boolean; certificateId?: string; error?: string }> {
  try {
    // 1. 既存の証明書をチェック
    const { data: existingCert } = await supabase
      .from('certificates')
      .select('id')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .maybeSingle();

    if (existingCert) {
      console.log('Certificate already exists for this course');
      return { success: true, certificateId: existingCert.id };
    }

    // 2. コース情報を取得
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, title')
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      console.error('Failed to fetch course:', courseError);
      return { success: false, error: 'コース情報の取得に失敗しました' };
    }

    // 3. ユーザー情報を取得
    const { data: userProfile, error: userError } = await supabase
      .from('user_profiles')
      .select('display_name, email')
      .eq('id', userId)
      .single();

    if (userError || !userProfile) {
      console.error('Failed to fetch user profile:', userError);
      return { success: false, error: 'ユーザー情報の取得に失敗しました' };
    }

    // 4. コースの動画数を取得
    const { data: videos, error: videosError } = await supabase
      .from('videos')
      .select('id')
      .eq('course_id', courseId)
      .eq('status', 'active');

    if (videosError) {
      console.error('Failed to fetch videos:', videosError);
      return { success: false, error: '動画情報の取得に失敗しました' };
    }

    const totalVideos = videos?.length || 0;

    // 5. ユーザーの完了した動画数を確認
    const { data: completedLogs, error: logsError } = await supabase
      .from('video_view_logs')
      .select('video_id')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .eq('status', 'completed');

    if (logsError) {
      console.error('Failed to fetch view logs:', logsError);
      return { success: false, error: '視聴ログの取得に失敗しました' };
    }

    const completedVideos = completedLogs?.length || 0;

    // 6. すべての動画が完了していない場合は証明書を生成しない
    if (completedVideos < totalVideos) {
      console.log(`Course not completed: ${completedVideos}/${totalVideos} videos completed`);
      return {
        success: false,
        error: `コースが完了していません (${completedVideos}/${totalVideos} 動画完了)`
      };
    }

    // 7. 証明書を生成
    const certificateId = generateCertificateId();
    const { data: newCertificate, error: insertError } = await supabase
      .from('certificates')
      .insert({
        id: certificateId,
        user_id: userId,
        course_id: courseId,
        user_name: userProfile.display_name || userProfile.email || 'ユーザー',
        course_title: course.title,
        completion_date: new Date().toISOString(),
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      // 重複エラーの場合は成功として扱う
      if (insertError.code === '23505' || insertError.message?.includes('duplicate')) {
        const { data: existingData } = await supabase
          .from('certificates')
          .select('id')
          .eq('user_id', userId)
          .eq('course_id', courseId)
          .maybeSingle();

        if (existingData) {
          return { success: true, certificateId: existingData.id };
        }
      }

      console.error('Failed to create certificate:', insertError);
      return { success: false, error: '証明書の作成に失敗しました' };
    }

    console.log('Certificate created successfully:', certificateId);
    return { success: true, certificateId: newCertificate.id };

  } catch (error) {
    console.error('Error in autoGenerateCertificate:', error);
    return { success: false, error: '予期しないエラーが発生しました' };
  }
}

/**
 * コースの進捗を確認し、完了している場合は証明書を生成
 */
export async function checkAndGenerateCertificate(
  userId: string,
  courseId: number
): Promise<{ hasNewCertificate: boolean; certificateId?: string }> {
  const result = await autoGenerateCertificate(userId, courseId);

  return {
    hasNewCertificate: result.success === true && !!result.certificateId,
    certificateId: result.certificateId
  };
}