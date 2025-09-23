import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-4 p-8 text-center">
        <h2 className="text-4xl font-bold text-gray-900 dark:text-white">404</h2>
        <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">
          ページが見つかりません
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          お探しのページは存在しないか、移動した可能性があります。
        </p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
        >
          ホームに戻る
        </Link>
      </div>
    </div>
  )
}