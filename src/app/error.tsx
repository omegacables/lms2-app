'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-4 p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            エラーが発生しました
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            申し訳ございません。エラーが発生しました。
          </p>
          {error.message && (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400">
              {error.message}
            </p>
          )}
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => reset()}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            再試行
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-neutral-900 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    </div>
  )
}