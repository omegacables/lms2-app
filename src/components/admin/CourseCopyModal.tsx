'use client';

// コースのコピー（管理画面のコース一覧から開く）。コピー後のコース名をここで決める。
// 動画ファイルは複製せず元のコースと同じものを再生する。小テスト・最終テストはコピーしない。

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/database/supabase';
import { COURSE_TITLE_MAX, defaultCopyTitle } from '@/lib/course/copyTitle';
import { CheckCircleIcon, DocumentDuplicateIcon, ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface CourseCopyModalProps {
  course: { id: number; title: string; video_count?: number };
  /** 既存のコース名（既定名の番号決めと、同じ名前の注意に使う） */
  existingTitles: string[];
  /** copied=true ならコピーを作成した */
  onClose: (copied: boolean) => void;
}

export function CourseCopyModal({ course, existingTitles, onClose }: CourseCopyModalProps) {
  const [title, setTitle] = useState(() => defaultCopyTitle(course.title, existingTitles));
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: number; title: string; videos: number; chapters: number } | null>(null);

  const trimmed = title.trim();
  const sameNameExists = useMemo(
    () => existingTitles.some((t) => (t || '').trim() === trimmed),
    [existingTitles, trimmed]
  );

  const close = () => !copying && onClose(!!result);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copying, result, onClose]);

  const copy = async () => {
    if (!trimmed) {
      setError('コース名を入力してください');
      return;
    }
    setCopying(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('認証セッションが見つかりません');
      const res = await fetch(`/api/courses/${course.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ title: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'コースのコピーに失敗しました');
      setResult({
        id: json.newCourseId,
        title: json.course?.title ?? trimmed,
        videos: json.copiedVideos ?? 0,
        chapters: json.copiedChapters ?? 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCopying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="course-copy-title"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="flex max-h-[95vh] w-full flex-col rounded-t-xl bg-white shadow-xl dark:bg-neutral-900 sm:max-h-[90vh] sm:max-w-lg sm:rounded-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4 dark:border-neutral-800 sm:px-6">
          <h3 id="course-copy-title" className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <DocumentDuplicateIcon className="h-5 w-5 text-blue-600" />
            {result ? 'コピーしました' : 'コースをコピー'}
          </h3>
          <button
            type="button"
            onClick={close}
            disabled={copying}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-neutral-800"
            aria-label="閉じる"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm sm:px-6">
          {result ? (
            <>
              <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
                <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
                <span>
                  「{result.title}」を<strong>非公開</strong>で作成しました（動画{result.videos}本
                  {result.chapters > 0 ? `・章${result.chapters}件` : ''}）。
                </span>
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                コース名や説明はコースの編集で変えられます。受講者に見せるときは、編集画面で「公開」にしてください。
              </p>
            </>
          ) : (
            <>
              <p className="text-gray-600 dark:text-gray-400">
                コピー元：<span className="font-medium text-gray-900 dark:text-gray-100">{course.title}</span>
              </p>

              <div>
                <label htmlFor="course-copy-name" className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  コピー後のコース名
                </label>
                <input
                  id="course-copy-name"
                  type="text"
                  value={title}
                  maxLength={COURSE_TITLE_MAX}
                  disabled={copying}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && copy()}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-100"
                  autoFocus
                />
                {sameNameExists && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">同じ名前のコースが既にあります（このままでもコピーできます）。</p>
                )}
              </div>

              <ul className="list-disc space-y-1 pl-5 text-xs text-gray-600 dark:text-gray-400">
                <li>
                  動画{typeof course.video_count === 'number' ? `${course.video_count}本` : ''}・章・資料をコピーします。
                  動画ファイルは複製せず、元のコースと同じ動画を再生します（保存容量は増えません）。
                </li>
                <li>小テスト・最終テストはコピーしません。</li>
                <li>受講者の割り当て・視聴記録・修了証はコピーしません。</li>
                <li>コピーは「非公開」で作成します。</li>
              </ul>

              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                  <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-4 py-3 dark:border-neutral-800 sm:flex-row sm:justify-end sm:px-6">
          {result ? (
            <>
              <Button variant="outline" onClick={close}>閉じる</Button>
              <Link href={`/admin/courses/${result.id}/edit`} onClick={() => onClose(true)}>
                <Button className="w-full">コースを編集</Button>
              </Link>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={close} disabled={copying}>キャンセル</Button>
              <Button onClick={copy} disabled={copying || !trimmed}>
                {copying ? 'コピー中…' : 'コピーする'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
