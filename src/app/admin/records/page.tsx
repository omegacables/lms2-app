'use client';

import { useState, useEffect, useCallback } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import { downloadCSV } from '@/lib/utils/csv';
import { generateLearningRecordPDFBlob, type LearningRecordData } from '@/lib/utils/learningRecordPDF';
import { generateCertificatePDFBlob } from '@/lib/utils/certificatePDF';
import { DocumentArrowDownIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline';
import JSZip from 'jszip';

interface CourseOpt { id: number; title: string; }
interface RosterRow {
  user_id: string;
  name: string;
  company: string;
  department: string;
  assigned_at: string | null;
  standard_learning_minutes: number | null;
  total_watched_seconds: number;
  completed_videos: number;
  total_videos: number;
  video_complete: boolean;
  tests_passed: boolean | null;
  completion_date: string | null;
}

async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return { 'Content-Type': 'application/json', Authorization: session?.access_token ? `Bearer ${session.access_token}` : '' };
}

const fmtDur = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
};

export default function AdminRecordsPage() {
  const [courses, setCourses] = useState<CourseOpt[]>([]);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [courseInfo, setCourseInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [qaFrom, setQaFrom] = useState('');
  const [qaTo, setQaTo] = useState('');
  const [signerSettings, setSignerSettings] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('courses').select('id, title').order('order_index', { ascending: true });
      setCourses(data || []);
      if (data && data.length > 0) setCourseId(data[0].id);

      // 証明書の署名設定
      const { data: sd } = await supabase
        .from('system_settings')
        .select('setting_key, setting_value')
        .in('setting_key', ['certificate.company_name', 'certificate.signer_name', 'certificate.signer_title', 'certificate.stamp_image_url']);
      const s: any = {};
      (sd || []).forEach((it) => { s[it.setting_key.split('.')[1]] = it.setting_value || ''; });
      setSignerSettings(s);
    })();
  }, []);

  const loadRoster = useCallback(async (cid: number) => {
    setLoading(true);
    setSelected(new Set());
    try {
      const res = await fetch(`/api/admin/course-roster?courseId=${cid}`, { headers: await authHeaders() });
      const json = await res.json();
      if (res.ok) { setRows(json.rows || []); setCourseInfo(json.course); }
      else alert(json.error || '受講一覧の取得に失敗しました');
    } catch { alert('受講一覧の取得に失敗しました'); }
    setLoading(false);
  }, []);

  useEffect(() => { if (courseId) loadRoster(courseId); }, [courseId, loadRoster]);

  const toggle = (uid: string) => {
    const next = new Set(selected);
    next.has(uid) ? next.delete(uid) : next.add(uid);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.user_id)));
  };

  // 受講一覧CSV
  const exportRosterCSV = () => {
    const header = ['氏名', '会社', '部署', '標準学習時間(分)', '受講時間合計', '動画完了', 'テスト通過', '修了日'];
    const data = rows.map((r) => [
      r.name, r.company, r.department,
      r.standard_learning_minutes ?? '',
      fmtDur(r.total_watched_seconds),
      r.video_complete ? '完了' : `${r.completed_videos}/${r.total_videos}`,
      r.tests_passed === null ? '—' : r.tests_passed ? '全通過' : '未通過',
      r.completion_date ? new Date(r.completion_date).toLocaleDateString('ja-JP') : '',
    ]);
    downloadCSV(`受講一覧_${courseInfo?.title || courseId}_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...data]);
  };

  const fetchRecord = async (uid: string): Promise<LearningRecordData | null> => {
    const res = await fetch(`/api/admin/learning-record?userId=${uid}&courseId=${courseId}`, { headers: await authHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as LearningRecordData;
  };

  // 個別 実施記録PDF
  const downloadRecordPDF = async (uid: string) => {
    setBusy(uid);
    try {
      const data = await fetchRecord(uid);
      if (!data) { alert('記録の取得に失敗しました'); return; }
      const { blob, fileName } = await generateLearningRecordPDFBlob(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url);
    } catch (e) { alert('PDF生成に失敗しました: ' + String(e)); }
    setBusy(null);
  };

  // 選択者を 修了証＋実施記録 でZIP出力
  const exportZip = async () => {
    if (selected.size === 0) { alert('受講者を選択してください'); return; }
    setBusy('zip');
    try {
      const zip = new JSZip();
      const usedFolders = new Set<string>();
      for (const uid of selected) {
        const row = rows.find((r) => r.user_id === uid);
        const data = await fetchRecord(uid);
        if (!data) continue;
        // 同姓同名でもフォルダが衝突しないよう一意化する
        let folderName = (row?.name || uid).replace(/[\\/:*?"<>|]/g, '_');
        if (usedFolders.has(folderName)) {
          let n = 2;
          while (usedFolders.has(`${folderName}_${n}`)) n++;
          folderName = `${folderName}_${n}`;
        }
        usedFolders.add(folderName);
        const folder = zip.folder(folderName) || zip;

        // 実施記録PDF
        const rec = await generateLearningRecordPDFBlob(data);
        folder.file(rec.fileName, rec.blob);

        // 修了証PDF（修了日がある場合）
        if (data.certificate?.completion_date || row?.completion_date) {
          const cert = await generateCertificatePDFBlob({
            certificateId: data.certificate?.id,
            courseName: data.course.title,
            userName: data.student.name,
            company: data.student.company,
            completionDate: new Date(data.certificate?.completion_date || row!.completion_date!).toLocaleDateString('ja-JP'),
            issueDate: new Date().toLocaleDateString('ja-JP'),
            totalVideos: data.videos.length,
            totalWatchTime: data.totalWatchedSeconds,
            issuerCompanyName: signerSettings?.company_name || undefined,
            signerName: signerSettings?.signer_name || undefined,
            signerTitle: signerSettings?.signer_title || undefined,
            stampImageUrl: signerSettings?.stamp_image_url || undefined,
          });
          folder.file(cert.fileName, cert.blob);
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `修了証_実施記録_${courseInfo?.title || courseId}_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('ZIP出力に失敗しました: ' + String(e)); }
    setBusy(null);
  };

  // 質疑応答ログCSV（選択者・期間）
  const exportQaCSV = async () => {
    if (selected.size === 0) { alert('受講者を選択してください'); return; }
    setBusy('qa');
    try {
      const allRows: (string | number)[][] = [['受講者', '日時', '種別', '発信者', '件名', '本文']];
      for (const uid of selected) {
        const row = rows.find((r) => r.user_id === uid);
        const q = new URLSearchParams({ userId: uid });
        if (qaFrom) q.set('from', qaFrom);
        if (qaTo) q.set('to', qaTo);
        const res = await fetch(`/api/admin/qa-log?${q.toString()}`, { headers: await authHeaders() });
        if (!res.ok) continue;
        const json = await res.json();
        (json.rows || []).forEach((r: any) => {
          allRows.push([row?.name || uid, new Date(r.date).toLocaleString('ja-JP'), r.kind, r.from_role, r.subject, r.body]);
        });
      }
      downloadCSV(`質疑応答ログ_${new Date().toISOString().slice(0, 10)}.csv`, allRows);
    } catch (e) { alert('質疑応答ログの出力に失敗しました: ' + String(e)); }
    setBusy(null);
  };

  return (
    <AuthGuard requiredRoles={['admin', 'instructor']}>
      <MainLayout>
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">帳票・実施記録出力</h1>
          <p className="text-sm text-gray-500 mb-6">受講一覧CSV・実施記録PDF・修了証＋記録の一括ZIP・質疑応答ログを出力します（支給申請用）。</p>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="text-sm text-gray-600 dark:text-gray-300">コース:</label>
            <select className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              value={courseId ?? ''} onChange={(e) => setCourseId(Number(e.target.value))}>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}（ID:{c.id}）</option>)}
            </select>
            <Button variant="outline" size="sm" onClick={exportRosterCSV} disabled={rows.length === 0}>
              <DocumentArrowDownIcon className="w-4 h-4 mr-1" /> 受講一覧CSV
            </Button>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">選択者を出力：</span>
            <Button size="sm" onClick={exportZip} loading={busy === 'zip'} disabled={selected.size === 0}>
              <ArchiveBoxIcon className="w-4 h-4 mr-1" /> 修了証＋実施記録ZIP
            </Button>
            <span className="text-xs text-gray-500">質疑応答 期間:</span>
            <input type="date" value={qaFrom} onChange={(e) => setQaFrom(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-900" />
            <span className="text-xs">〜</span>
            <input type="date" value={qaTo} onChange={(e) => setQaTo(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-900" />
            <Button variant="outline" size="sm" onClick={exportQaCSV} loading={busy === 'qa'} disabled={selected.size === 0}>
              <DocumentArrowDownIcon className="w-4 h-4 mr-1" /> 質疑応答ログCSV
            </Button>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center"><LoadingSpinner size="lg" /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">このコースの受講者がいません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 pr-3"><input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} /></th>
                    <th className="py-2 pr-4">氏名</th>
                    <th className="py-2 pr-4">会社</th>
                    <th className="py-2 pr-4">受講時間</th>
                    <th className="py-2 pr-4">動画</th>
                    <th className="py-2 pr-4">テスト</th>
                    <th className="py-2 pr-4">修了日</th>
                    <th className="py-2 pr-4">実施記録</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.user_id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 pr-3"><input type="checkbox" checked={selected.has(r.user_id)} onChange={() => toggle(r.user_id)} /></td>
                      <td className="py-2 pr-4 whitespace-nowrap">{r.name}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{r.company}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{fmtDur(r.total_watched_seconds)}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{r.video_complete ? <span className="text-green-600">完了</span> : `${r.completed_videos}/${r.total_videos}`}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{r.tests_passed === null ? '—' : r.tests_passed ? <span className="text-green-600">全通過</span> : <span className="text-gray-500">未通過</span>}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{r.completion_date ? new Date(r.completion_date).toLocaleDateString('ja-JP') : '—'}</td>
                      <td className="py-2 pr-4">
                        <Button variant="outline" size="sm" onClick={() => downloadRecordPDF(r.user_id)} loading={busy === r.user_id}>PDF</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
