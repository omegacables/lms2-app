'use client';

import { useState, useCallback } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { Button } from '@/components/ui/Button';

interface AvatarCropperModalProps {
  imageSrc: string;
  onCancel: () => void;
  /** クロップ確定時に JPEG Blob（512x512）を返す */
  onCropped: (blob: Blob) => void;
  uploading?: boolean;
}

/** クロップ範囲を canvas で切り出して JPEG Blob にする */
async function getCroppedBlob(imageSrc: string, cropPixels: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const OUTPUT_SIZE = 512;
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context を取得できませんでした');

  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('画像の生成に失敗しました'))),
      'image/jpeg',
      0.9
    );
  });
}

export function AvatarCropperModal({ imageSrc, onCancel, onCropped, uploading }: AvatarCropperModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    try {
      setProcessing(true);
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels);
      onCropped(blob);
    } catch (err) {
      console.error('[AvatarCropper] クロップ失敗:', err);
      alert('画像の切り抜きに失敗しました。別の画像でお試しください。');
    } finally {
      setProcessing(false);
    }
  };

  const busy = processing || !!uploading;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-neutral-900 rounded-lg max-w-md w-full overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-neutral-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            プロフィール画像を調整
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            ドラッグで位置、スライダーで拡大率を調整できます
          </p>
        </div>

        {/* クロップ領域 */}
        <div className="relative w-full h-72 bg-gray-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* ズームスライダー */}
        <div className="px-6 py-4">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">拡大率</label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer"
            disabled={busy}
          />
        </div>

        <div className="flex justify-end gap-2 px-4 pb-4">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            キャンセル
          </Button>
          <Button onClick={handleConfirm} disabled={busy || !croppedAreaPixels}>
            {busy ? 'アップロード中...' : 'この画像を使う'}
          </Button>
        </div>
      </div>
    </div>
  );
}
