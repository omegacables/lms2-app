'use client';

import { useState, useEffect } from 'react';
import { CheckCircleIcon, DocumentArrowDownIcon, AcademicCapIcon } from '@heroicons/react/24/solid';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { generateCertificatePDF, type CertificateData } from '@/lib/utils/certificatePDF';
import { supabase } from '@/lib/database/supabase';
import { generateCertificateId } from '@/lib/utils';
import type { Course, UserProfile } from '@/types';

interface CourseCertificateProps {
  course: Course;
  user: UserProfile;
  completionDate: Date;
  progress: {
    completedVideos: number;
    totalVideos: number;
    totalWatchTime: number;
  };
}

export function CourseCertificate({
  course,
  user,
  completionDate,
  progress
}: CourseCertificateProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingCertificate, setExistingCertificate] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // すべての動画を視聴したかチェック
  const isEligibleForCertificate = progress.completedVideos === progress.totalVideos;

  // 既存の証明書をチェック
  useEffect(() => {
    const checkExistingCertificate = async () => {
      if (!user || !course) return;

      try {
        const { data, error } = await supabase
          .from('certificates')
          .select('*')
          .eq('user_id', user.id)
          .eq('course_id', course.id)
          .maybeSingle();

        if (data) {
          setExistingCertificate(data);
        }
      } catch (err) {
        console.error('Error checking certificate:', err);
      } finally {
        setIsLoading(false);
      }
    };

    checkExistingCertificate();
  }, [user, course]);

  // 証明書データの準備
  const prepareCertificateData = (): CertificateData => {
    return {
      certificateId: existingCertificate?.id || generateCertificateId(),
      courseName: course.title,
      userName: user.display_name || user.email,
      completionDate: format(completionDate, 'yyyy年MM月dd日', { locale: ja }),
      issueDate: format(new Date(), 'yyyy年MM月dd日', { locale: ja }),
      totalVideos: progress.totalVideos,
      totalWatchTime: Math.round(progress.totalWatchTime / 60), // 分に変換
      courseDescription: course.description || '',
      organization: '企業研修LMS',
      company: user.company_name || undefined,
    };
  };

  const handleDownloadCertificate = async () => {
    if (!isEligibleForCertificate) {
      setError('すべての動画を視聴完了してから修了証を発行してください。');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const certificateData = prepareCertificateData();

      // 既存の証明書がない場合は新規作成
      if (!existingCertificate) {
        // 証明書IDを生成
        const certificateId = generateCertificateId();
        certificateData.certificateId = certificateId;

        // データベースに保存
        const { data: newCertificate, error: dbError } = await supabase
          .from('certificates')
          .insert({
            id: certificateId,
            user_id: user.id,
            course_id: course.id,
            user_name: user.display_name || user.email || 'ユーザー',
            course_title: course.title,
            completion_date: completionDate.toISOString(),
            pdf_url: null, // PDFは保存しない（動的生成）
            is_active: true,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (dbError) {
          console.error('Certificate save error:', dbError);
          // 重複エラーの場合は既存の証明書を取得
          if (dbError.code === '23505' || dbError.message?.includes('duplicate')) {
            const { data: existingData } = await supabase
              .from('certificates')
              .select('*')
              .eq('user_id', user.id)
              .eq('course_id', course.id)
              .maybeSingle();

            if (existingData) {
              setExistingCertificate(existingData);
              certificateData.certificateId = existingData.id;
              await generateCertificatePDF(certificateData);
              console.log('Using existing certificate');
              return;
            }
          }
          // その他のエラーの場合はPDF生成のみ実行
          await generateCertificatePDF(certificateData);
          setError('証明書は生成されましたが、データベースへの保存に失敗しました。');
        } else {
          setExistingCertificate(newCertificate);
          // PDF生成
          await generateCertificatePDF(certificateData);
        }
      } else {
        // 既存の証明書を再ダウンロード
        await generateCertificatePDF(certificateData);
      }

      console.log('Certificate generated successfully');
    } catch (err) {
      console.error('Certificate generation error:', err);
      setError('修了証の生成に失敗しました。もう一度お試しください。');
    } finally {
      setIsGenerating(false);
    }
  };

  // 視聴時間を読みやすい形式に変換
  const formatWatchTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 0) {
      return `${hours}時間${mins}分`;
    }
    return `${mins}分`;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <AcademicCapIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            修了証
          </h2>
        </div>
        {isEligibleForCertificate && (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircleIcon className="w-6 h-6" />
            <span className="font-medium">発行可能</span>
          </div>
        )}
      </div>

      {/* コース情報 */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
          コース情報
        </h3>
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-gray-600 dark:text-gray-400">コース名:</dt>
            <dd className="font-medium text-gray-900 dark:text-white">
              {course.title}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600 dark:text-gray-400">修了日:</dt>
            <dd className="font-medium text-gray-900 dark:text-white">
              {format(completionDate, 'yyyy年MM月dd日', { locale: ja })}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600 dark:text-gray-400">総視聴時間:</dt>
            <dd className="font-medium text-gray-900 dark:text-white">
              {formatWatchTime(Math.round(progress.totalWatchTime / 60))}
            </dd>
          </div>
        </dl>
      </div>

      {/* 進捗状況 */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            動画視聴進捗
          </span>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {progress.completedVideos} / {progress.totalVideos} 完了
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${
              isEligibleForCertificate
                ? 'bg-green-600'
                : 'bg-blue-600'
            }`}
            style={{
              width: `${(progress.completedVideos / progress.totalVideos) * 100}%`
            }}
          />
        </div>
        {!isEligibleForCertificate && (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            あと{progress.totalVideos - progress.completedVideos}本の動画を視聴すると修了証を発行できます。
          </p>
        )}
      </div>

      {/* エラーメッセージ */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* 発行ボタン */}
      <button
        onClick={handleDownloadCertificate}
        disabled={!isEligibleForCertificate || isGenerating || isLoading}
        className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
          isEligibleForCertificate
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
        }`}
      >
        {isGenerating ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
            生成中...
          </>
        ) : existingCertificate ? (
          <>
            <DocumentArrowDownIcon className="w-5 h-5" />
            修了証を再ダウンロード
          </>
        ) : (
          <>
            <DocumentArrowDownIcon className="w-5 h-5" />
            修了証をダウンロード
          </>
        )}
      </button>

      {/* 注意事項 */}
      <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
        <p>※ 修了証はPDF形式でダウンロードされます。</p>
        <p>※ すべての動画を視聴完了後に発行可能となります。</p>
        <p>※ 再発行も可能です。</p>
      </div>
    </div>
  );
}