'use client';

// 動画ごとのサムネイルの設定（管理画面の動画管理。コースの「動画ごとのサムネイル」が ON のときに出す）。
// 画像は送る前に 1280px 幅までの JPEG に縮める（受講者の一覧で読み込む量を減らすため。Vercel の 4.5MB 制限にも収まる）。

import { useRef, useState } from 'react';
import { supabase } from '@/lib/database/supabase';
import { PhotoIcon } from '@heroicons/react/24/outline';

const MAX_WIDTH = 1280;

async function shrinkImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // 読めない形式はそのまま送り、サーバー側の判定に任せる
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

interface VideoThumbnailEditorProps {
  videoId: string | number;
  thumbnailUrl?: string | null;
  onChange: (url: string | null) => void;
}

export function VideoThumbnailEditor({ videoId, thumbnailUrl, onChange }: VideoThumbnailEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async (method: 'POST' | 'DELETE', body?: FormData) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('認証セッションが見つかりません');
    const res = await fetch(`/api/videos/${videoId}/thumbnail`, {
      method,
      headers: { Authorization: `Bearer ${session.access_token}` },
      body,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'サムネイルを保存できませんでした');
    return json as { thumbnail_url: string | null };
  };

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('thumbnail', await shrinkImage(file));
      const json = await request('POST', form);
      onChange(json.thumbnail_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('この動画のサムネイルを外しますか？')) return;
    setBusy(true);
    setError(null);
    try {
      await request('DELETE');
      onChange(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-32 flex-shrink-0 sm:w-40">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="group relative block aspect-video w-full overflow-hidden rounded-md border border-gray-200 bg-gray-100 dark:border-neutral-700 dark:bg-neutral-800"
        title={thumbnailUrl ? 'サムネイルを変更' : 'サムネイルを設定'}
      >
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
            <PhotoIcon className="h-5 w-5" />
            サムネイルなし
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white">保存中…</span>
        )}
      </button>
      <div className="mt-1 flex gap-2 text-[11px]">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
        >
          {thumbnailUrl ? '変更' : '設定'}
        </button>
        {thumbnailUrl && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
          >
            外す
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-1 text-[11px] text-red-600 dark:text-red-400">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
