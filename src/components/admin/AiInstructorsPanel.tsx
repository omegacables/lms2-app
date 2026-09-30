'use client';

// 添削の担当講師の設定（小テスト管理の「講師」タブ）。
// 小テスト・最終テストは回答・提出の直後に自動で添削して返却する。その署名（「講師　名前」）に使う名前を最大5名まで登録し、
// コースごとの担当は「テスト管理」タブのコース設定で選ぶ。

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/database/supabase';

export interface AiInstructorRow {
  id: number;
  name: string;
  title: string | null;
  sort_order: number;
  course_count?: number;
}

async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
  };
}

export function AiInstructorsPanel({
  instructors,
  max,
  onChanged,
}: {
  instructors: AiInstructorRow[];
  max: number;
  /** 追加・変更・削除のあとに一覧を読み直す */
  onChanged: () => Promise<void> | void;
}) {
  const [newName, setNewName] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const res = await fetch('/api/admin/ai-instructors', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ name: newName, title: newTitle || null }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      alert(json.error || '登録に失敗しました');
      return;
    }
    setNewName('');
    setNewTitle('');
    await onChanged();
  };

  const save = async (id: number) => {
    if (!editName.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/admin/ai-instructors/${id}`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({ name: editName, title: editTitle || null }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      alert(json.error || '更新に失敗しました');
      return;
    }
    setEditing(null);
    await onChanged();
  };

  const remove = async (row: AiInstructorRow) => {
    const note = row.course_count ? `\n担当している ${row.course_count} コースは「未設定（先頭の講師）」に戻ります。` : '';
    if (!confirm(`講師「${row.name}」を削除しますか？${note}\nこれまでの添削の署名はそのまま残ります。`)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/ai-instructors/${row.id}`, { method: 'DELETE', headers: await authHeaders() });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      alert(json.error || '削除に失敗しました');
      return;
    }
    await onChanged();
  };

  const move = async (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= instructors.length) return;
    const a = instructors[index];
    const b = instructors[target];
    setBusy(true);
    const headers = await authHeaders();
    await Promise.all([
      fetch(`/api/admin/ai-instructors/${a.id}`, { method: 'PATCH', headers, body: JSON.stringify({ sort_order: target }) }),
      fetch(`/api/admin/ai-instructors/${b.id}`, { method: 'PATCH', headers, body: JSON.stringify({ sort_order: index }) }),
    ]);
    setBusy(false);
    await onChanged();
  };

  const inputCls =
    'border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm';

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-900/10 text-sm text-gray-700 dark:text-gray-200 space-y-1">
        <p>小テストは回答した直後に、最終テストは提出した直後に、自動で添削して返却します（最終テストは合否も自動で判定します）。</p>
        <p>受講者の画面・課題ページでは、コースの担当講師の署名が <span className="font-bold text-red-600">「講師　名前」</span> と表示されます。学習記録PDFには、AIによる自動添削であることと、講師が確認した場合は確認者が記録されます。</p>
        <p>コースごとの担当は「テスト管理」タブのコース設定で選びます。未設定のコースは、一覧の先頭の講師が担当します。</p>
      </div>

      <div className="space-y-2">
        {instructors.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">講師はまだ登録されていません。登録するまでは署名が「講師」だけになります。</p>
        ) : (
          instructors.map((row, index) => (
            <div key={row.id} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-wrap items-center gap-3">
              {editing === row.id ? (
                <>
                  <input className={`${inputCls} w-48`} value={editName} maxLength={50} onChange={(e) => setEditName(e.target.value)} placeholder="名前" />
                  <input className={`${inputCls} w-56`} value={editTitle} maxLength={100} onChange={(e) => setEditTitle(e.target.value)} placeholder="肩書き（任意）" />
                  <Button size="sm" onClick={() => save(row.id)} disabled={!editName.trim()} loading={busy}>保存</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(null)}>キャンセル</Button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      <span className="text-red-600" style={{ fontFamily: '"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif' }}>講師　{row.name}</span>
                      {index === 0 && <span className="ml-2 text-xs text-gray-500">（未設定のコースの担当）</span>}
                    </div>
                    <div className="text-xs text-gray-500">
                      {row.title ? `${row.title} ／ ` : ''}担当コース {row.course_count ?? 0} 件
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => move(index, -1)} disabled={busy || index === 0} title="上へ">↑</Button>
                    <Button size="sm" variant="outline" onClick={() => move(index, 1)} disabled={busy || index === instructors.length - 1} title="下へ">↓</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(row.id);
                        setEditName(row.name);
                        setEditTitle(row.title || '');
                      }}
                    >編集</Button>
                    <Button size="sm" variant="destructive" onClick={() => remove(row)} disabled={busy}>削除</Button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {instructors.length < max ? (
        <div className="p-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
            講師を追加（あと {max - instructors.length} 名まで）
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-red-600 font-bold">講師</span>
            <input className={`${inputCls} w-48`} value={newName} maxLength={50} onChange={(e) => setNewName(e.target.value)} placeholder="名前（例：山田）" />
            <input className={`${inputCls} w-56`} value={newTitle} maxLength={100} onChange={(e) => setNewTitle(e.target.value)} placeholder="肩書き（任意）" />
            <Button size="sm" onClick={add} disabled={!newName.trim()} loading={busy}>追加</Button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            ここで登録する名前は自動添削の署名に使うもので、ログイン用のアカウントとは別です。
          </p>
        </div>
      ) : (
        <p className="text-xs text-gray-500">講師は最大 {max} 名まで登録できます。</p>
      )}
    </div>
  );
}
