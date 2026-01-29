'use client';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import {
  UserCircleIcon,
  EnvelopeIcon,
  PhoneIcon,
  QuestionMarkCircleIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';

export default function LaborConsultantSupportPage() {
  const { user } = useAuth();

  const supportItems = [
    {
      title: 'よくある質問',
      description: 'システムの使い方や機能についてのよくある質問をご覧いただけます。',
      icon: QuestionMarkCircleIcon,
      color: 'bg-blue-500',
      link: '#faq'
    },
    {
      title: '操作マニュアル',
      description: '各機能の詳しい使い方を説明したマニュアルをご覧いただけます。',
      icon: DocumentTextIcon,
      color: 'bg-green-500',
      link: '#manual'
    },
    {
      title: 'お問い合わせ',
      description: 'システムに関するご質問やご要望をお送りいただけます。',
      icon: ChatBubbleLeftRightIcon,
      color: 'bg-purple-500',
      link: '#contact'
    }
  ];

  const faqItems = [
    {
      question: '担当会社はどのように割り当てられますか？',
      answer: '担当会社は管理者によって割り当てられます。管理者メニューの「社労士事務所管理」から設定されます。'
    },
    {
      question: '生徒の学習状況はどこで確認できますか？',
      answer: '「担当生徒」ページで各生徒の基本情報と学習統計を、「学習ログ」ページで詳細な視聴履歴を確認できます。'
    },
    {
      question: '証明書はダウンロードできますか？',
      answer: '「証明書」ページから担当生徒が取得した証明書のPDFをダウンロードできます。'
    },
    {
      question: '生徒にメッセージを送ることはできますか？',
      answer: '現在のバージョンではメッセージ機能は管理者のみが使用できます。将来のバージョンで対応予定です。'
    },
    {
      question: '担当外の会社の生徒は見えますか？',
      answer: 'いいえ。割り当てられた会社の生徒のみ閲覧可能です。セキュリティとプライバシー保護のため、他の会社の情報にはアクセスできません。'
    }
  ];

  return (
    <AuthGuard>
      <MainLayout>
        <div className="container mx-auto px-4 py-8">
          {/* ヘッダー */}
          <div className="mb-8">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mr-4">
                <UserCircleIcon className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">サポート</h1>
                <p className="text-gray-600 dark:text-gray-400">ヘルプとサポート情報</p>
              </div>
            </div>
          </div>

          {/* サポートメニュー */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {supportItems.map((item, index) => (
              <a
                key={index}
                href={item.link}
                className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start">
                  <div className={`w-12 h-12 ${item.color} rounded-lg flex items-center justify-center mr-4 flex-shrink-0`}>
                    <item.icon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {item.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {item.description}
                    </p>
                  </div>
                </div>
              </a>
            ))}
          </div>

          {/* よくある質問 */}
          <div id="faq" className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">よくある質問</h2>
            <div className="space-y-6">
              {faqItems.map((item, index) => (
                <div key={index} className="border-b border-gray-200 dark:border-gray-700 pb-6 last:border-b-0 last:pb-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-start">
                    <QuestionMarkCircleIcon className="h-6 w-6 text-blue-500 mr-2 flex-shrink-0 mt-0.5" />
                    {item.question}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 ml-8">
                    {item.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 操作マニュアル */}
          <div id="manual" className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">操作マニュアル</h2>
            <div className="space-y-4">
              <div className="flex items-start p-4 bg-gray-50 dark:bg-neutral-800 rounded-lg">
                <DocumentTextIcon className="h-6 w-6 text-blue-500 mr-3 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">ダッシュボード</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    担当会社・生徒の統計情報を確認できます。各カードをクリックすると詳細ページに移動します。
                  </p>
                </div>
              </div>

              <div className="flex items-start p-4 bg-gray-50 dark:bg-neutral-800 rounded-lg">
                <DocumentTextIcon className="h-6 w-6 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">担当生徒</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    担当会社の生徒一覧と学習統計を確認できます。検索機能や会社フィルターで絞り込みが可能です。
                  </p>
                </div>
              </div>

              <div className="flex items-start p-4 bg-gray-50 dark:bg-neutral-800 rounded-lg">
                <DocumentTextIcon className="h-6 w-6 text-cyan-500 mr-3 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">学習ログ</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    生徒の詳細な視聴履歴を確認できます。進捗状況やステータスでフィルタリングできます。
                  </p>
                </div>
              </div>

              <div className="flex items-start p-4 bg-gray-50 dark:bg-neutral-800 rounded-lg">
                <DocumentTextIcon className="h-6 w-6 text-yellow-500 mr-3 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">証明書</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    担当生徒が取得した証明書の一覧を確認し、PDFをダウンロードできます。
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* お問い合わせ */}
          <div id="contact" className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">お問い合わせ</h2>
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400">
                システムに関するご質問やご要望がございましたら、以下の方法でお問い合わせください。
              </p>

              <div className="flex items-start p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <EnvelopeIcon className="h-6 w-6 text-blue-500 mr-3 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">メール</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    support@example.com
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    営業日24時間以内に返信いたします
                  </p>
                </div>
              </div>

              <div className="flex items-start p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <PhoneIcon className="h-6 w-6 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">電話</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    0120-XXX-XXXX
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    受付時間: 平日 9:00-18:00
                  </p>
                </div>
              </div>

              <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  緊急のトラブルやシステム障害については、管理者に直接お問い合わせください。
                </p>
              </div>
            </div>
          </div>

          {/* ユーザー情報 */}
          <div className="mt-8 bg-gray-50 dark:bg-neutral-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">ログイン情報</h3>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>ユーザー名: {user?.profile?.display_name || user?.email}</p>
              <p>メールアドレス: {user?.email}</p>
              <p>権限: 社労士事務所</p>
            </div>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
