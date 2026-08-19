'use client';

import { useState, useEffect, useCallback } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import { downloadCSV } from '@/lib/utils/csv';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowUpTrayIcon,
  DocumentArrowDownIcon,
  CheckCircleIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';

interface CourseOpt { id: number; title: string; }
interface VideoOpt { id: number; title: string; order_index: number; }
interface QuizRow {
  id: number;
  course_id: number;
  after_video_id: number | null;
  title: string;
  quiz_type: 'choice' | 'essay';
  status: 'draft' | 'published';
  sort_order: number;
  question_count: number;
}
interface QuestionDraft {
  question_text: string;
  choices: string[];
  correct_index: number | null;
  explanation: string;
}
interface AttemptRow {
  id: number;
  user_name: string;
  company: string;
  quiz_title: string;
  quiz_type: string;
  question_text: string;
  selected_text: string;
  answer_text: string | null;
  is_correct: boolean | null;
  attempt_no: number;
  answered_at: string;
}

async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
  };
}

export default function AdminQuizzesPage() {
  const [tab, setTab] = useState<'manage' | 'attempts'>('manage');
  const [courses, setCourses] = useState<CourseOpt[]>([]);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [videos, setVideos] = useState<VideoOpt[]>([]);
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [loading, setLoading] = useState(false);

  // クイズ作成モーダル
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<'choice' | 'essay'>('choice');
  const [newAfterVideo, setNewAfterVideo] = useState<string>('end'); // 'end' or video id

  // 設問エディタ
  const [editingQuiz, setEditingQuiz] = useState<QuizRow | null>(null);
  const [questionDrafts, setQuestionDrafts] = useState<QuestionDraft[]>([]);
  const [savingQuestions, setSavingQuestions] = useState(false);

  // CSVインポート
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // 回答状況
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);

  // コース設定（通信制モード ON/OFF ほか）
  const [settings, setSettings] = useState<{
    test_required: boolean;
    standard_learning_minutes: number | null;
    standard_learning_period: string | null;
    training_type_note: string | null;
  } | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // コース一覧の取得
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('courses').select('id, title').order('order_index', { ascending: true });
      setCourses(data || []);
      if (data && data.length > 0) setCourseId(data[0].id);
    })();
  }, []);

  const loadCourseData = useCallback(async (cid: number) => {
    setLoading(true);
    const { data: vids } = await supabase
      .from('videos')
      .select('id, title, order_index')
      .eq('course_id', cid)
      .order('order_index', { ascending: true });
    setVideos(vids || []);

    try {
      const res = await fetch(`/api/admin/quizzes?courseId=${cid}`, { headers: await authHeaders() });
      const json = await res.json();
      if (res.ok) setQuizzes(json.quizzes || []);
      else alert(json.error || 'クイズ取得に失敗しました');
    } catch {
      alert('クイズ取得に失敗しました');
    }

    // コース設定を取得
    try {
      const sres = await fetch(`/api/admin/courses/${cid}/settings`, { headers: await authHeaders() });
      const sjson = await sres.json();
      if (sres.ok) {
        setSettings({
          test_required: !!sjson.settings.test_required,
          standard_learning_minutes: sjson.settings.standard_learning_minutes,
          standard_learning_period: sjson.settings.standard_learning_period,
          training_type_note: sjson.settings.training_type_note,
        });
      }
    } catch {
      /* 設定取得失敗時はパネル非表示 */
    }
    setLoading(false);
  }, []);

  const saveSettings = async (patch: Partial<NonNullable<typeof settings>>) => {
    if (!courseId || !settings) return;
    setSavingSettings(true);
    const res = await fetch(`/api/admin/courses/${courseId}/settings`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    setSavingSettings(false);
    if (res.ok) {
      setSettings({
        test_required: !!json.settings.test_required,
        standard_learning_minutes: json.settings.standard_learning_minutes,
        standard_learning_period: json.settings.standard_learning_period,
        training_type_note: json.settings.training_type_note,
      });
    } else {
      alert(json.error || '設定の保存に失敗しました');
    }
  };

  useEffect(() => {
    if (courseId) loadCourseData(courseId);
  }, [courseId, loadCourseData]);

  const videoTitle = (id: number | null) => {
    if (id === null) return 'コース末（最終テスト位置）';
    const v = videos.find((x) => x.id === id);
    return v ? `${v.title} の直後` : `動画#${id} の直後`;
  };

  // --- クイズ作成 ---
  const createQuiz = async () => {
    if (!courseId || !newTitle.trim()) return;
    const res = await fetch('/api/admin/quizzes', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        course_id: courseId,
        title: newTitle.trim(),
        quiz_type: newType,
        after_video_id: newAfterVideo === 'end' ? null : Number(newAfterVideo),
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setShowCreate(false);
      setNewTitle('');
      setNewAfterVideo('end');
      setNewType('choice');
      loadCourseData(courseId);
    } else {
      alert(json.error || '作成に失敗しました');
    }
  };

  // --- 公開切替 ---
  const togglePublish = async (q: QuizRow) => {
    const next = q.status === 'published' ? 'draft' : 'published';
    const res = await fetch(`/api/admin/quizzes/${q.id}`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({ status: next }),
    });
    const json = await res.json();
    if (res.ok) loadCourseData(courseId!);
    else alert(json.error || '更新に失敗しました');
  };

  // --- 削除 ---
  const deleteQuiz = async (q: QuizRow) => {
    if (!confirm(`クイズ「${q.title}」を削除しますか？`)) return;
    const res = await fetch(`/api/admin/quizzes/${q.id}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    const json = await res.json();
    if (res.ok) loadCourseData(courseId!);
    else alert(json.error || '削除に失敗しました');
  };

  // --- 設問エディタを開く ---
  const openEditor = async (q: QuizRow) => {
    const res = await fetch(`/api/admin/quizzes/${q.id}`, { headers: await authHeaders() });
    const json = await res.json();
    if (!res.ok) { alert(json.error || '取得に失敗しました'); return; }
    const drafts: QuestionDraft[] = (json.questions || []).map((qq: any) => ({
      question_text: qq.question_text || '',
      choices: q.quiz_type === 'choice' ? [...(qq.choices || []), '', '', '', ''].slice(0, 4) : [],
      correct_index: qq.correct_index,
      explanation: qq.explanation || '',
    }));
    if (drafts.length === 0) {
      drafts.push(emptyDraft(q.quiz_type));
    }
    setQuestionDrafts(drafts);
    setEditingQuiz(q);
  };

  const emptyDraft = (type: 'choice' | 'essay'): QuestionDraft => ({
    question_text: '',
    choices: type === 'choice' ? ['', '', '', ''] : [],
    correct_index: type === 'choice' ? 0 : null,
    explanation: '',
  });

  const saveQuestions = async () => {
    if (!editingQuiz) return;
    setSavingQuestions(true);
    const payload = {
      questions: questionDrafts.map((d) => ({
        question_text: d.question_text,
        choices: editingQuiz.quiz_type === 'choice' ? d.choices.filter((c) => c.trim() !== '') : [],
        correct_index: editingQuiz.quiz_type === 'choice' ? d.correct_index : null,
        explanation: d.explanation,
      })),
    };
    const res = await fetch(`/api/admin/quizzes/${editingQuiz.id}/questions`, {
      method: 'PUT',
      headers: await authHeaders(),
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setSavingQuestions(false);
    if (res.ok) {
      setEditingQuiz(null);
      loadCourseData(courseId!);
    } else {
      alert(json.error || '保存に失敗しました');
    }
  };

  // --- CSVインポート ---
  const downloadTemplate = () => {
    downloadCSV('小テスト_インポート雛形.csv', [
      ['コースID', '配置動画ID', 'テスト名', '設問', '選択肢1', '選択肢2', '選択肢3', '選択肢4', '正答番号', '解説'],
      [courseId ?? 1, '', '小テスト1', '例）正しいものはどれ？', '選択肢A', '選択肢B', '選択肢C', '選択肢D', 2, '解説文（不正解時に表示）'],
    ]);
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const res = await fetch('/api/admin/quizzes/import', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ csv: text }),
      });
      const json = await res.json();
      if (res.ok) {
        const lines = (json.summary || []).map(
          (s: any) => `・${s.title}（設問${s.questions}問）→ ${s.action}`
        );
        setImportResult(`インポート完了（${json.quizCount}件のテスト）\n${lines.join('\n')}`);
        if (courseId) loadCourseData(courseId);
      } else {
        const errs = json.errors ? '\n' + json.errors.join('\n') : '';
        setImportResult(`エラー: ${json.error}${errs}`);
      }
    } catch (e) {
      setImportResult(`インポートに失敗しました: ${String(e)}`);
    }
    setImporting(false);
  };

  // --- 回答状況 ---
  const loadAttempts = useCallback(async (cid: number) => {
    setAttemptsLoading(true);
    try {
      const res = await fetch(`/api/admin/quizzes/attempts?courseId=${cid}`, { headers: await authHeaders() });
      const json = await res.json();
      if (res.ok) setAttempts(json.attempts || []);
      else alert(json.error || '回答状況の取得に失敗しました');
    } catch {
      alert('回答状況の取得に失敗しました');
    }
    setAttemptsLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'attempts' && courseId) loadAttempts(courseId);
  }, [tab, courseId, loadAttempts]);

  const exportAttempts = () => {
    const header = ['受講者', '会社', 'テスト名', '種別', '設問', '解答', '正誤', '挑戦回数', '回答日時'];
    const rows = attempts.map((a) => [
      a.user_name,
      a.company,
      a.quiz_title,
      a.quiz_type === 'choice' ? '選択式' : '記述式',
      a.question_text,
      a.quiz_type === 'choice' ? a.selected_text : a.answer_text || '',
      a.is_correct === null ? '—' : a.is_correct ? '正解' : '不正解',
      a.attempt_no,
      new Date(a.answered_at).toLocaleString('ja-JP'),
    ]);
    downloadCSV(`回答状況_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

  return (
    <AuthGuard requiredRoles={['admin']}>
      <MainLayout>
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">小テスト・最終テスト管理</h1>
          </div>

          {/* コース選択 */}
          <div className="mb-4 flex items-center gap-3">
            <label className="text-sm text-gray-600 dark:text-gray-300">コース:</label>
            <select
              className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              value={courseId ?? ''}
              onChange={(e) => setCourseId(Number(e.target.value))}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}（ID:{c.id}）</option>
              ))}
            </select>
          </div>

          {/* タブ */}
          <div className="border-b border-gray-200 dark:border-gray-700 mb-6 flex gap-4">
            <button
              className={`pb-2 text-sm font-medium ${tab === 'manage' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
              onClick={() => setTab('manage')}
            >テスト管理</button>
            <button
              className={`pb-2 text-sm font-medium ${tab === 'attempts' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
              onClick={() => setTab('attempts')}
            >回答状況</button>
          </div>

          {tab === 'manage' && (
            <>
              {/* 通信制モード設定 */}
              {settings && (
                <div className="mb-6 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={settings.test_required}
                      disabled={savingSettings}
                      onChange={(e) => saveSettings({ test_required: e.target.checked })}
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        このコースで小テスト・最終テストを使う（通信制モード）
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        ONにすると、受講者に小テストが表示され、未通過なら次の動画が解放されません（サーバーサイドゲート）。
                        OFFのコースは小テストを表示せず、視聴は従来どおり任意順です。
                      </div>
                    </div>
                  </label>

                  <div className="mt-4 grid sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">標準学習時間（分）</label>
                      <input
                        type="number"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                        defaultValue={settings.standard_learning_minutes ?? ''}
                        onBlur={(e) => {
                          const v = e.target.value === '' ? null : Number(e.target.value);
                          if (v !== (settings.standard_learning_minutes ?? null)) saveSettings({ standard_learning_minutes: v });
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">標準学習期間</label>
                      <input
                        type="text"
                        placeholder="例）約1ヶ月"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                        defaultValue={settings.standard_learning_period ?? ''}
                        onBlur={(e) => {
                          const v = e.target.value || null;
                          if (v !== (settings.standard_learning_period ?? null)) saveSettings({ standard_learning_period: v });
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">訓練区分メモ</label>
                      <input
                        type="text"
                        placeholder="例）通信制"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                        defaultValue={settings.training_type_note ?? ''}
                        onBlur={(e) => {
                          const v = e.target.value || null;
                          if (v !== (settings.training_type_note ?? null)) saveSettings({ training_type_note: v });
                        }}
                      />
                    </div>
                  </div>
                  {!settings.test_required && (
                    <p className="text-xs text-amber-600 mt-3">
                      現在このコースは通信制モードOFFです。小テストを作成・公開しても受講者には表示されず、ゲートも働きません。
                    </p>
                  )}
                </div>
              )}

              {/* CSVインポート */}
              <div className="mb-6 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">CSV一括インポート</span>
                  <Button variant="outline" size="sm" onClick={downloadTemplate}>
                    <DocumentArrowDownIcon className="w-4 h-4 mr-1" /> 雛形をダウンロード
                  </Button>
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImportFile(f);
                        e.target.value = '';
                      }}
                    />
                    <span className="inline-flex items-center h-9 px-3 text-xs rounded-md border border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
                      <ArrowUpTrayIcon className="w-4 h-4 mr-1" /> CSVを選択して取込
                    </span>
                  </label>
                  {importing && <LoadingSpinner size="sm" />}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  列: コースID, 配置動画ID(空欄=コース末), テスト名, 設問, 選択肢1〜4, 正答番号(1始まり), 解説。取込後は「下書き」で作成されます。
                </p>
                {importResult && (
                  <pre className="mt-3 text-xs whitespace-pre-wrap text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700">{importResult}</pre>
                )}
              </div>

              <div className="flex justify-end mb-3">
                <Button size="sm" onClick={() => setShowCreate(true)}>
                  <PlusIcon className="w-4 h-4 mr-1" /> 新規テスト作成
                </Button>
              </div>

              {loading ? (
                <div className="py-12 flex justify-center"><LoadingSpinner size="lg" /></div>
              ) : quizzes.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">このコースにはまだテストがありません。</p>
              ) : (
                <div className="space-y-3">
                  {quizzes.map((q) => (
                    <div key={q.id} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-wrap items-center gap-3 justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">{q.title}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${q.quiz_type === 'choice' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                            {q.quiz_type === 'choice' ? '選択式小テスト' : '記述式最終テスト'}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded ${q.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                            {q.status === 'published' ? '公開中' : '下書き'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          配置: {videoTitle(q.after_video_id)} ／ 設問 {q.question_count} 問
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEditor(q)}>
                          <PencilIcon className="w-4 h-4 mr-1" /> 設問編集
                        </Button>
                        <Button variant={q.status === 'published' ? 'secondary' : 'primary'} size="sm" onClick={() => togglePublish(q)}>
                          {q.status === 'published' ? (<><EyeSlashIcon className="w-4 h-4 mr-1" />非公開</>) : (<><CheckCircleIcon className="w-4 h-4 mr-1" />公開</>)}
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => deleteQuiz(q)}>
                          <TrashIcon className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'attempts' && (
            <div>
              <div className="flex justify-end mb-3">
                <Button variant="outline" size="sm" onClick={exportAttempts} disabled={attempts.length === 0}>
                  <DocumentArrowDownIcon className="w-4 h-4 mr-1" /> CSVエクスポート
                </Button>
              </div>
              {attemptsLoading ? (
                <div className="py-12 flex justify-center"><LoadingSpinner size="lg" /></div>
              ) : attempts.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">回答記録がありません。</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                        <th className="py-2 pr-4">受講者</th>
                        <th className="py-2 pr-4">テスト</th>
                        <th className="py-2 pr-4">設問</th>
                        <th className="py-2 pr-4">解答</th>
                        <th className="py-2 pr-4">正誤</th>
                        <th className="py-2 pr-4">挑戦</th>
                        <th className="py-2 pr-4">回答日時</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attempts.map((a) => (
                        <tr key={a.id} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-2 pr-4 whitespace-nowrap">{a.user_name}</td>
                          <td className="py-2 pr-4 whitespace-nowrap">{a.quiz_title}</td>
                          <td className="py-2 pr-4 max-w-xs truncate" title={a.question_text}>{a.question_text}</td>
                          <td className="py-2 pr-4 max-w-xs truncate" title={a.quiz_type === 'choice' ? a.selected_text : a.answer_text || ''}>
                            {a.quiz_type === 'choice' ? a.selected_text : a.answer_text}
                          </td>
                          <td className="py-2 pr-4 whitespace-nowrap">
                            {a.is_correct === null ? '—' : a.is_correct ? (
                              <span className="text-green-600">正解</span>
                            ) : (
                              <span className="text-red-600">不正解</span>
                            )}
                          </td>
                          <td className="py-2 pr-4">{a.attempt_no}</td>
                          <td className="py-2 pr-4 whitespace-nowrap">{new Date(a.answered_at).toLocaleString('ja-JP')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 作成モーダル */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">新規テスト作成</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">テスト名</label>
                  <input className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="小テスト1" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">種別</label>
                  <select className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    value={newType} onChange={(e) => setNewType(e.target.value as 'choice' | 'essay')}>
                    <option value="choice">選択式小テスト</option>
                    <option value="essay">記述式最終テスト</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">配置位置</label>
                  <select className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    value={newAfterVideo} onChange={(e) => setNewAfterVideo(e.target.value)}>
                    {videos.map((v) => (
                      <option key={v.id} value={v.id}>{v.title} の直後</option>
                    ))}
                    <option value="end">コース末（最終テスト位置）</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>キャンセル</Button>
                <Button size="sm" onClick={createQuiz} disabled={!newTitle.trim()}>作成</Button>
              </div>
            </div>
          </div>
        )}

        {/* 設問エディタモーダル */}
        {editingQuiz && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  設問編集：{editingQuiz.title}
                  <span className="ml-2 text-xs text-gray-500">{editingQuiz.quiz_type === 'choice' ? '選択式' : '記述式'}</span>
                </h2>
              </div>

              <div className="space-y-5">
                {questionDrafts.map((d, qi) => (
                  <div key={qi} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">設問 {qi + 1}</span>
                      <button className="text-red-500 text-xs hover:underline" onClick={() => setQuestionDrafts(questionDrafts.filter((_, i) => i !== qi))}>削除</button>
                    </div>
                    <textarea className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                      rows={2} placeholder="設問本文"
                      value={d.question_text}
                      onChange={(e) => {
                        const next = [...questionDrafts];
                        next[qi] = { ...d, question_text: e.target.value };
                        setQuestionDrafts(next);
                      }} />

                    {editingQuiz.quiz_type === 'choice' && (
                      <div className="mt-2 space-y-1">
                        {d.choices.map((c, ci) => (
                          <div key={ci} className="flex items-center gap-2">
                            <input type="radio" name={`correct-${qi}`} checked={d.correct_index === ci}
                              onChange={() => {
                                const next = [...questionDrafts];
                                next[qi] = { ...d, correct_index: ci };
                                setQuestionDrafts(next);
                              }} />
                            <input className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                              placeholder={`選択肢${ci + 1}`} value={c}
                              onChange={(e) => {
                                const next = [...questionDrafts];
                                const choices = [...d.choices];
                                choices[ci] = e.target.value;
                                next[qi] = { ...d, choices };
                                setQuestionDrafts(next);
                              }} />
                          </div>
                        ))}
                        <p className="text-xs text-gray-400">左のラジオボタンで正答を選択</p>
                      </div>
                    )}

                    <textarea className="w-full mt-2 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                      rows={2} placeholder={editingQuiz.quiz_type === 'choice' ? '解説（不正解時に表示）' : '採点の参考メモ（任意）'}
                      value={d.explanation}
                      onChange={(e) => {
                        const next = [...questionDrafts];
                        next[qi] = { ...d, explanation: e.target.value };
                        setQuestionDrafts(next);
                      }} />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setQuestionDrafts([...questionDrafts, emptyDraft(editingQuiz.quiz_type)])}>
                  <PlusIcon className="w-4 h-4 mr-1" /> 設問を追加
                </Button>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" size="sm" onClick={() => setEditingQuiz(null)}>キャンセル</Button>
                <Button size="sm" onClick={saveQuestions} loading={savingQuestions}>保存</Button>
              </div>
            </div>
          </div>
        )}
      </MainLayout>
    </AuthGuard>
  );
}
