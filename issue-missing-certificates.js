// 証明書未発行ユーザーへの一括発行スクリプト
const { createClient } = require('@supabase/supabase-js');

// 環境変数から読み込み
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('環境変数が設定されていません');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// 証明書ID生成
function generateCertificateId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9).toUpperCase();
  return `CERT-${timestamp}-${random}`;
}

async function findAndIssueMissingCertificates() {
  console.log('=== 証明書未発行ユーザーの確認と発行 ===\n');

  try {
    // 1. 全コースを取得
    const { data: courses, error: coursesError } = await supabase
      .from('courses')
      .select('id, title')
      .eq('status', 'active');

    if (coursesError) {
      console.error('コース取得エラー:', coursesError);
      return;
    }

    console.log(`対象コース数: ${courses.length}`);

    let totalIssued = 0;
    let totalAlreadyIssued = 0;
    let totalIncomplete = 0;

    for (const course of courses) {
      console.log(`\n--- コース: ${course.title} (ID: ${course.id}) ---`);

      // 2. コースの動画を取得
      const { data: videos, error: videosError } = await supabase
        .from('videos')
        .select('id')
        .eq('course_id', course.id)
        .eq('status', 'active');

      if (videosError) {
        console.error(`  動画取得エラー:`, videosError);
        continue;
      }

      const totalVideos = videos?.length || 0;
      if (totalVideos === 0) {
        console.log(`  動画なし、スキップ`);
        continue;
      }

      console.log(`  動画数: ${totalVideos}`);

      // 3. このコースの学習ログを持つユーザーを取得
      const { data: logs, error: logsError } = await supabase
        .from('video_view_logs')
        .select('user_id, video_id, status')
        .eq('course_id', course.id)
        .eq('status', 'completed');

      if (logsError) {
        console.error(`  学習ログ取得エラー:`, logsError);
        continue;
      }

      // ユーザーごとに完了した動画をグループ化
      const userCompletedVideos = new Map();
      for (const log of logs || []) {
        if (!userCompletedVideos.has(log.user_id)) {
          userCompletedVideos.set(log.user_id, new Set());
        }
        userCompletedVideos.get(log.user_id).add(log.video_id);
      }

      // 4. 全動画を完了したユーザーを特定
      const completedUsers = [];
      for (const [userId, completedVideoIds] of userCompletedVideos) {
        const videoIdSet = new Set(videos.map(v => v.id));
        const allCompleted = videos.every(v => completedVideoIds.has(v.id));
        if (allCompleted) {
          completedUsers.push(userId);
        }
      }

      console.log(`  コース完了ユーザー数: ${completedUsers.length}`);

      if (completedUsers.length === 0) {
        totalIncomplete += userCompletedVideos.size;
        continue;
      }

      // 5. 既存の証明書を確認
      const { data: existingCerts, error: certsError } = await supabase
        .from('certificates')
        .select('user_id')
        .eq('course_id', course.id)
        .in('user_id', completedUsers);

      if (certsError) {
        console.error(`  証明書確認エラー:`, certsError);
        continue;
      }

      const existingUserIds = new Set(existingCerts?.map(c => c.user_id) || []);
      const usersNeedingCerts = completedUsers.filter(u => !existingUserIds.has(u));

      console.log(`  証明書発行済み: ${existingUserIds.size}`);
      console.log(`  証明書未発行: ${usersNeedingCerts.length}`);

      totalAlreadyIssued += existingUserIds.size;

      // 6. 未発行ユーザーに証明書を発行
      for (const userId of usersNeedingCerts) {
        // ユーザー情報を取得
        const { data: userProfile, error: userError } = await supabase
          .from('user_profiles')
          .select('display_name, email')
          .eq('id', userId)
          .single();

        if (userError || !userProfile) {
          console.error(`  ユーザー情報取得エラー (${userId}):`, userError);
          continue;
        }

        // 最後に完了した日時を取得
        const { data: lastLog } = await supabase
          .from('video_view_logs')
          .select('completed_at, last_updated, created_at')
          .eq('user_id', userId)
          .eq('course_id', course.id)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(1)
          .single();

        const completionDate = lastLog?.completed_at || lastLog?.last_updated || lastLog?.created_at || new Date().toISOString();

        // 証明書を作成
        const certificateId = generateCertificateId();
        const { error: insertError } = await supabase
          .from('certificates')
          .insert({
            id: certificateId,
            user_id: userId,
            course_id: course.id,
            user_name: userProfile.display_name || userProfile.email || 'ユーザー',
            course_title: course.title,
            completion_date: completionDate,
            is_active: true,
            created_at: new Date().toISOString()
          });

        if (insertError) {
          if (insertError.code === '23505') {
            console.log(`  [スキップ] ${userProfile.display_name || userProfile.email} - 既に発行済み`);
            totalAlreadyIssued++;
          } else {
            console.error(`  [エラー] ${userProfile.display_name || userProfile.email}:`, insertError.message);
          }
        } else {
          console.log(`  [発行] ${userProfile.display_name || userProfile.email} - ${certificateId}`);
          totalIssued++;
        }
      }
    }

    console.log('\n=== 結果サマリー ===');
    console.log(`新規発行: ${totalIssued} 件`);
    console.log(`既に発行済み: ${totalAlreadyIssued} 件`);
    console.log(`コース未完了: ${totalIncomplete} ユーザー`);

  } catch (error) {
    console.error('エラー:', error);
  }
}

// 実行
findAndIssueMissingCertificates();
