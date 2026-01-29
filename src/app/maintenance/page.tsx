'use client';

import { ClockIcon } from '@heroicons/react/24/outline';

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* メインカード */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 md:p-12">
          {/* 年始アイコン */}
          <div className="flex justify-center mb-6">
            <div className="text-7xl">🎍</div>
          </div>

          {/* 新年のご挨拶 */}
          <div className="text-center mb-6">
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">
              謹賀新年
            </p>
            <p className="text-gray-600 dark:text-gray-300 text-sm">
              本年もどうぞよろしくお願いいたします
            </p>
          </div>

          {/* タイトル */}
          <h1 className="text-3xl md:text-4xl font-bold text-center text-gray-900 dark:text-white mb-4">
            年始休業のお知らせ
          </h1>

          <div className="text-center text-gray-600 dark:text-gray-300 mb-8">
            <p className="text-lg mb-4">
              誠に勝手ながら、下記期間中は<br />
              サーバーを休止させていただきます。
            </p>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
              <p className="text-xl font-bold text-red-700 dark:text-red-400">
                1月1日（水）〜 1月5日（日）15:00
              </p>
            </div>
            <p className="text-base text-gray-700 dark:text-gray-300">
              期間中は受講いただくことができません。<br />
              ご不便をおかけいたしますが、何卒ご了承ください。
            </p>
          </div>

          {/* 情報カード */}
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-6 mb-8">
            <div className="flex items-start space-x-4">
              <ClockIcon className="w-6 h-6 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  再開予定
                </h3>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <li className="flex items-start">
                    <span className="inline-block w-2 h-2 bg-orange-500 rounded-full mr-2 mt-1.5"></span>
                    <span><strong>1月5日（日）15:00</strong> よりサービス再開予定です</span>
                  </li>
                  <li className="flex items-start">
                    <span className="inline-block w-2 h-2 bg-orange-500 rounded-full mr-2 mt-1.5"></span>
                    <span>学習データは安全に保管されています</span>
                  </li>
                  <li className="flex items-start">
                    <span className="inline-block w-2 h-2 bg-orange-500 rounded-full mr-2 mt-1.5"></span>
                    <span>再開後は通常通りご利用いただけます</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* 再読み込みボタン */}
          <div className="text-center">
            <button
              onClick={() => window.location.href = '/auth/login'}
              className="inline-flex items-center px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors duration-200 shadow-lg hover:shadow-xl"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              ページを再読み込み
            </button>
          </div>

          {/* フッター */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 space-y-4">
            {/* 管理者ログインリンク */}
            <div className="text-center">
              <a
                href="/admin/login"
                className="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                管理者の方はこちら
              </a>
            </div>

            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              お問い合わせは管理者までご連絡ください
            </p>
          </div>
        </div>

        {/* 年始装飾 */}
        <div className="mt-8 flex justify-center space-x-4 text-3xl">
          <span>🎌</span>
          <span>🌅</span>
          <span>🎌</span>
        </div>
      </div>
    </div>
  );
}
