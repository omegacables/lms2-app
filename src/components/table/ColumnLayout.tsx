'use client';

// 表の「列」の表示切り替えと列幅の変更（ブラウザごとに保存）。
// - 「列」メニュー：おすすめの列／すべての列／自分で選ぶ（常に出す列は外せない）
// - 画面の幅が足りないときは右側の列から自動で隠し、メニューに「幅が足りず隠している列」として出す
//   （「隠している列も出す」を選ぶと、表を横にスクロールして全部出す）
// - 見出しの右端をドラッグすると列幅を変えられる（ダブルクリックで元の幅に戻す）

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, ViewColumnsIcon } from '@heroicons/react/24/outline';

export interface ColumnDef {
  key: string;
  label: string;
  /** 常に出す列（外せない） */
  fixed?: boolean;
  /** おすすめの列に含める */
  recommended?: boolean;
  /** 既定の幅（px） */
  width: number;
  /** 最小の幅（px） */
  minWidth?: number;
  /** 幅が足りないときに隠す順（大きいほど先に隠す。省略時は右にある列ほど先） */
  hideRank?: number;
}

interface Saved {
  selected?: string[];
  widths?: Record<string, number>;
  showOverflow?: boolean;
}

const MIN_WIDTH = 48;

function readSaved(storageKey: string): Saved {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as Saved) : {};
  } catch {
    return {};
  }
}

function writeSaved(storageKey: string, saved: Saved) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(saved));
  } catch {
    // 保存できない環境（プライベートモードなど）では、その場だけの設定になる
  }
}

export function useColumnLayout(storageKey: string, columns: ColumnDef[]) {
  const recommendedKeys = useMemo(() => columns.filter((c) => c.fixed || c.recommended).map((c) => c.key), [columns]);
  const allKeys = useMemo(() => columns.map((c) => c.key), [columns]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(recommendedKeys));
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [showOverflow, setShowOverflow] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  // 表を置く要素（読み込み中は表が無いことがあるので、置かれた時点で受け取る）
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);

  // 保存した設定を読む（描画後に読むので、サーバー描画との食い違いが起きない）
  useEffect(() => {
    const saved = readSaved(storageKey);
    if (Array.isArray(saved.selected)) {
      const known = saved.selected.filter((k) => allKeys.includes(k));
      setSelected(new Set([...known, ...columns.filter((c) => c.fixed).map((c) => c.key)]));
    }
    if (saved.widths && typeof saved.widths === 'object') setWidths(saved.widths);
    if (typeof saved.showOverflow === 'boolean') setShowOverflow(saved.showOverflow);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return;
    writeSaved(storageKey, { selected: Array.from(selected), widths, showOverflow });
  }, [loaded, storageKey, selected, widths, showOverflow]);

  // 表を置く場所の幅を見張る
  useEffect(() => {
    if (!containerEl || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    ro.observe(containerEl);
    setContainerWidth(containerEl.clientWidth);
    return () => ro.disconnect();
  }, [containerEl]);

  const widthOf = useCallback(
    (key: string) => {
      const def = columns.find((c) => c.key === key);
      return Math.max(def?.minWidth ?? MIN_WIDTH, widths[key] ?? def?.width ?? 120);
    },
    [columns, widths]
  );

  // 表示する列と、幅が足りず隠している列
  const { visibleColumns, hiddenByWidth } = useMemo(() => {
    const chosen = columns.filter((c) => c.fixed || selected.has(c.key));
    if (showOverflow || containerWidth === null) return { visibleColumns: chosen, hiddenByWidth: [] as ColumnDef[] };
    let total = chosen.reduce((s, c) => s + widthOf(c.key), 0);
    const hidden = new Set<string>();
    const hideOrder = chosen
      .map((c, i) => ({ c, rank: c.hideRank ?? i }))
      .filter((x) => !x.c.fixed)
      .sort((a, b) => b.rank - a.rank);
    for (const { c } of hideOrder) {
      if (total <= containerWidth) break;
      total -= widthOf(c.key);
      hidden.add(c.key);
    }
    return {
      visibleColumns: chosen.filter((c) => !hidden.has(c.key)),
      hiddenByWidth: chosen.filter((c) => hidden.has(c.key)),
    };
  }, [columns, selected, showOverflow, containerWidth, widthOf]);

  const tableWidth = visibleColumns.reduce((s, c) => s + widthOf(c.key), 0);

  const toggle = (key: string) => {
    const def = columns.find((c) => c.key === key);
    if (!def || def.fixed) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const chooseRecommended = () => setSelected(new Set(recommendedKeys));
  const chooseAll = () => setSelected(new Set(allKeys));
  const isRecommended = recommendedKeys.length === selected.size && recommendedKeys.every((k) => selected.has(k));
  const isAll = allKeys.every((k) => selected.has(k));

  const setWidth = (key: string, w: number) => {
    const def = columns.find((c) => c.key === key);
    setWidths((prev) => ({ ...prev, [key]: Math.max(def?.minWidth ?? MIN_WIDTH, Math.round(w)) }));
  };
  const resetWidth = (key: string) =>
    setWidths((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  const resetAllWidths = () => setWidths({});

  return {
    /** 表を包む要素に ref={layout.containerRef} で付ける */
    containerRef: setContainerEl,
    columns,
    selected,
    visibleColumns,
    hiddenByWidth,
    showOverflow,
    setShowOverflow,
    widthOf,
    tableWidth,
    toggle,
    chooseRecommended,
    chooseAll,
    isRecommended,
    isAll,
    setWidth,
    resetWidth,
    resetAllWidths,
    hasCustomWidths: Object.keys(widths).length > 0,
  };
}

export type ColumnLayout = ReturnType<typeof useColumnLayout>;

/** 見出しの右端の「つまみ」。ドラッグで列幅を変える。ダブルクリックで元の幅に戻す */
export function ColumnResizeHandle({ layout, columnKey }: { layout: ColumnLayout; columnKey: string }) {
  const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = layout.widthOf(columnKey);
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => layout.setWidth(columnKey, startW + ev.clientX - startX);
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      layout.setWidth(columnKey, layout.widthOf(columnKey) + (e.key === 'ArrowRight' ? 16 : -16));
    }
  };
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="列の幅を変える（ダブルクリックで元に戻す）"
      tabIndex={0}
      title="ドラッグで列の幅を変える（ダブルクリックで元に戻す）"
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        layout.resetWidth(columnKey);
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
      className="absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize touch-none select-none border-r-2 border-transparent hover:border-blue-400 focus:border-blue-500 focus:outline-none"
    />
  );
}

/** 「列」ボタンとメニュー */
export function ColumnMenu({ layout }: { layout: ColumnLayout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item =
    'flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-neutral-700';
  const check = (on: boolean) => <CheckIcon className={`h-4 w-4 shrink-0 ${on ? 'text-blue-600 dark:text-blue-400' : 'invisible'}`} />;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-neutral-800 dark:text-gray-200 dark:hover:bg-neutral-700"
      >
        <ViewColumnsIcon className="h-5 w-5" />
        列
        {layout.hiddenByWidth.length > 0 && (
          <span className="ml-0.5 rounded-full bg-amber-100 px-1.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            {layout.hiddenByWidth.length}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-72 max-h-[70vh] overflow-y-auto rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg dark:border-gray-700 dark:bg-neutral-800"
        >
          <button type="button" role="menuitemradio" aria-checked={layout.isRecommended} className={item} onClick={layout.chooseRecommended}>
            {check(layout.isRecommended)}
            おすすめの列
          </button>
          <button type="button" role="menuitemradio" aria-checked={layout.isAll} className={item} onClick={layout.chooseAll}>
            {check(layout.isAll)}
            すべての列
          </button>

          <div className="my-1.5 border-t border-gray-200 dark:border-gray-700" />
          <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400">自分で選ぶ</div>
          {layout.columns.map((c) => (
            <button
              key={c.key}
              type="button"
              role="menuitemcheckbox"
              aria-checked={c.fixed || layout.selected.has(c.key)}
              aria-disabled={c.fixed}
              className={`${item} ${c.fixed ? 'cursor-default' : ''}`}
              onClick={() => layout.toggle(c.key)}
            >
              {check(!!c.fixed || layout.selected.has(c.key))}
              <span>
                {c.label}
                {c.fixed && <span className="text-gray-500 dark:text-gray-400">（常に出す列）</span>}
              </span>
            </button>
          ))}

          {(layout.hiddenByWidth.length > 0 || layout.showOverflow) && (
            <>
              <div className="my-1.5 border-t border-gray-200 dark:border-gray-700" />
              {layout.hiddenByWidth.length > 0 && (
                <div className="px-3 py-1">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    幅が足りず隠している列（{layout.hiddenByWidth.length}）
                  </div>
                  <div className="mt-0.5 text-sm text-gray-800 dark:text-gray-100">{layout.hiddenByWidth.map((c) => c.label).join('・')}</div>
                </div>
              )}
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={layout.showOverflow}
                className={item}
                onClick={() => layout.setShowOverflow(!layout.showOverflow)}
              >
                {check(layout.showOverflow)}
                隠している列も出す（表が横にスクロールします）
              </button>
            </>
          )}

          {layout.hasCustomWidths && (
            <>
              <div className="my-1.5 border-t border-gray-200 dark:border-gray-700" />
              <button type="button" className={item} onClick={layout.resetAllWidths}>
                {check(false)}
                列の幅を元に戻す
              </button>
            </>
          )}
          <p className="px-3 pb-1 pt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
            列の幅は、見出しの右端をドラッグすると変えられます（ダブルクリックで元の幅）。設定はこのブラウザに保存されます。
          </p>
        </div>
      )}
    </div>
  );
}
