'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-black">
          <div className="w-full max-w-md space-y-4 p-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                システムエラー
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                申し訳ございません。システムエラーが発生しました。
              </p>
            </div>
            <button
              onClick={() => reset()}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-white hover:bg-blue-700"
            >
              再試行
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}