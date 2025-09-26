import { supabase } from '@/lib/database/supabase';
import { generateCertificateId } from '@/lib/utils';

/**
 * コース完了時に証明書を自動生成（API経由）
 */
export async function autoGenerateCertificate(
  userId: string,
  courseId: number
): Promise<{ success: boolean; certificateId?: string; error?: string }> {
  console.log('✨ autoGenerateCertificate 開始（API経由）');
  console.log(`  ユーザーID: ${userId}`);
  console.log(`  コースID: ${courseId}`);

  try {
    // APIエンドポイントを呼び出して証明書を生成
    const response = await fetch('/api/certificates/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        courseId
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('証明書生成APIエラー:', result);
      return {
        success: false,
        error: result.error || '証明書の生成に失敗しました'
      };
    }

    if (result.success) {
      console.log('🎉 証明書が正常に作成されました！');
      console.log('  証明書ID:', result.certificateId);
      return {
        success: true,
        certificateId: result.certificateId
      };
    }

    return {
      success: false,
      error: result.error || '証明書の生成に失敗しました'
    };

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