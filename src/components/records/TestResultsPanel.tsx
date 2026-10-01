'use client';

// テスト・添削の閲覧（社労士向け。管理者・講師も使える）。
// コースごとに、受講者×テスト（小テスト・最終テスト）の回答・添削の状況を一覧にし、
// 受講者を選ぶと設問・回答・添削の中身（実施記録と同じ内容）を表示する。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { RecordViewer, recordAuthHeaders } from '@/components/records/RecordViewer';

interface CourseOpt {
  id: number;
  title: string;
}
interface QuizCol {
  id: number;
  title: string;
  kind: 'small' | 'final';
  video_title: string | null;
}
interface SmallResult {
  status: 'none' | 'partial' | 'answered';
  answered: number;
  total: number;
  at: string | null;
  review: 'pending' | 'ready' | 'failed' | null;
  confirmed: boolean;
}
interface FinalResult {
  status: 'not_submitted' | 'under_review' | 'passed' | 'needs_revision';
  at: string | null;
  auto: boolean;
  confirmed: boolean;
}
interface Row {
  user_id: string;
  name: string;
  company: string;
  department: string;
  results: Record<string, SmallResult | FinalResult>;
}

const chip = 'inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium';

function SmallCell({ r }: { r?: SmallResult }) {
  if (!r || r.status === 'none') return <span className="text-gray-400">—</span>;
  const date = r.at ? new Date(r.at).toLocaleDateString('ja-JP') : '';
  return (
    <div className="space-y-0.5">
      {r.status === 'answered' ? (
        <span className={`${chip} bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300`}>回答済</span>
      ) : (
        <span className={`${chip} bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300`}>
          一部 {r.answered}/{r.total}
        </span>
      )}
      <div className="text-[11px] text-gray-500 whitespace-nowrap">
        {r.review === 'ready' ? (r.confirmed ? '添削済・確認済' : '添削済') : r.review === 'pending' ? '添削中' : r.review === 'failed' ? '添削なし' : ''}
        {date && <span className="ml-1">{date}</span>}
      </div>
    </div>
  );
}

function FinalCell({ r }: { r?: FinalResult }) {
  if (!r || r.status === 'not_submitted') return <span className="text-gray-400">未提出</span>;
  const date = r.at ? new Date(r.at).toLocaleDateString('ja-JP') : '';
  const label =
    r.status === 'passed' ? (
      <span className={`${chip} bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300`}>合格</span>
    ) : r.status === 'needs_revision' ? (
      <span className={`${chip} bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300`}>要再提出</span>
    ) : (
      <span className={`${chip} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300`}>添削中</span>
    );
  return (
    <div className="space-y-0.5">
      {label}
      <div className="text-[11px] text-gray-500 whitespace-nowrap">
        {r.status !== 'under_review' && (r.auto ? '自動添削' : r.confirmed ? '自動添削・確認済' : '講師添削')}
        {date && <span className="ml-1">{date}</span>}
      </div>
    </div>
  );
}

export function TestResultsPanel({ audience }: { audience: 'admin' | 'consultant' }) {
  const [courses, setCourses] = useState<CourseOpt[]>([]);
  const [coursesLoaded, setCoursesLoaded] = useState(false);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [quizzes, setQuizzes] = useState<QuizCol[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState('all');
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<Row | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/record-courses', { headers: await recordAuthHeaders() });
        const json = await res.json();
        if (res.ok) {
          setCourses(json.courses || []);
          if (json.courses?.length > 0) setCourseId(json.courses[0].id);
        } else alert(json.error || 'コースの取得に失敗しました');
      } catch {
        alert('コースの取得に失敗しました');
      }
      setCoursesLoaded(true);
    })();
  }, []);

  const load = useCallback(async (cid: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/test-results?courseId=${cid}`, { headers: await recordAuthHeaders() });
      const json = await res.json();
      if (res.ok) {
        setQuizzes(json.quizzes || []);
        setRows(json.rows || []);
      } else alert(json.error || 'テストの状況の取得に失敗しました');
    } catch {
      alert('テストの状況の取得に失敗しました');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (courseId) load(courseId);
  }, [courseId, load]);

  const companies = useMemo(
    () => Array.from(new Set(rows.map((r) => r.company).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ja')),
    [rows]
  );
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) => (company === 'all' || r.company === company) && (!q || r.name.toLowerCase().includes(q) || r.department.toLowerCase().includes(q))
    );
  }, [rows, company, search]);

  // テストごとの集計（表示中の受講者）
  const totals = useMemo(() => {
    const t: Record<number, string> = {};
    for (const q of quizzes) {
      const results = shown.map((r) => r.results[q.id]);
      if (q.kind === 'small') {
        const n = results.filter((x) => (x as SmallResult | undefined)?.status === 'answered').length;
        t[q.id] = `回答済 ${n}/${shown.length}`;
      } else {
        const n = results.filter((x) => (x as FinalResult | undefined)?.status === 'passed').length;
        t[q.id] = `合格 ${n}/${shown.length}`;
      }
    }
    return t;
  }, [quizzes, shown]);

  const courseTitle = courses.find((c) => c.id === courseId)?.title || '';
  const inputCls =
    'border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">テスト・添削</h1>
      <p className="text-sm text-gray-500 mb-6">
        {audience === 'consultant' ? '担当会社の受講者の、' : '受講者の、'}
        小テスト・最終テストの回答と添削の状況です。氏名を押すと、設問・回答・添削の内容（実施記録と同じ内容）を表示します。
      </p>

      {coursesLoaded && courses.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          {audience === 'consultant' ? '担当会社の受講者が受講しているコースがありません。' : 'コースがありません。'}
        </p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="text-sm text-gray-600 dark:text-gray-300">コース:</label>
            <select className={inputCls} value={courseId ?? ''} onChange={(e) => setCourseId(Number(e.target.value))}>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            {companies.length > 1 && (
              <select className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} aria-label="会社で絞り込む">
                <option value="all">すべての会社</option>
                {companies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            <input
              className={`${inputCls} w-48`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="氏名・部署で検索"
              aria-label="氏名・部署で検索"
            />
          </div>

          {loading || !coursesLoaded ? (
            <div className="py-12 flex justify-center">
              <LoadingSpinner size="lg" />
            </div>
          ) : quizzes.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">このコースにはテストがありません。</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              {audience === 'consultant' ? 'このコースを受講している担当会社の受講者がいません。' : 'このコースの受講者がいません。'}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-neutral-900">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-neutral-800">
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                    <th className="sticky left-0 z-10 bg-gray-50 dark:bg-neutral-800 px-3 py-2 min-w-[11rem]">受講者</th>
                    {quizzes.map((q) => (
                      <th
                        key={q.id}
                        className="px-3 py-2 align-bottom"
                        title={`${q.title}${q.video_title ? `（${q.video_title} の後）` : ''}`}
                      >
                        <div className={`max-w-[7.5rem] truncate ${q.kind === 'final' ? 'text-blue-700 dark:text-blue-300' : ''}`}>{q.title}</div>
                        <div className="font-normal text-[11px] text-gray-400">{q.kind === 'final' ? '最終テスト' : '小テスト'}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {shown.map((r) => (
                    <tr key={r.user_id} className="hover:bg-gray-50 dark:hover:bg-neutral-800/60 align-top">
                      <td className="sticky left-0 z-10 bg-white dark:bg-neutral-900 px-3 py-2">
                        <button
                          className="text-left font-medium text-blue-700 hover:underline dark:text-blue-300"
                          onClick={() => setViewing(r)}
                          title="設問・回答・添削の内容を表示"
                        >
                          {r.name}
                        </button>
                        <div className="text-xs text-gray-500">
                          {r.company}
                          {r.department ? `　${r.department}` : ''}
                        </div>
                      </td>
                      {quizzes.map((q) => (
                        <td key={q.id} className="px-3 py-2">
                          {q.kind === 'small' ? (
                            <SmallCell r={r.results[q.id] as SmallResult | undefined} />
                          ) : (
                            <FinalCell r={r.results[q.id] as FinalResult | undefined} />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {shown.length > 0 && (
                  <tfoot className="bg-gray-50 dark:bg-neutral-800 text-xs text-gray-600 dark:text-gray-300">
                    <tr>
                      <td className="sticky left-0 z-10 bg-gray-50 dark:bg-neutral-800 px-3 py-2 font-medium">集計（{shown.length}名）</td>
                      {quizzes.map((q) => (
                        <td key={q.id} className="px-3 py-2 whitespace-nowrap">
                          {totals[q.id]}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
              {shown.length === 0 && <p className="text-sm text-gray-500 py-6 text-center">条件に合う受講者がいません。</p>}
            </div>
          )}
        </>
      )}

      {viewing && courseId && (
        <RecordViewer
          userId={viewing.user_id}
          courseId={courseId}
          title={`${viewing.name}（${courseTitle}）`}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
