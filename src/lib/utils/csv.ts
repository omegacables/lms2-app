// 共有CSVユーティリティ（RFC 4180 準拠のパース／生成）
// 既存 admin/students/page.tsx の parseCSV と同等の挙動を共通化したもの。

/** CSV文字列を2次元配列にパースする。引用符・エスケープ("")・改行(\r\n/\n)に対応 */
export function parseCSV(csv: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  // 先頭のBOMを除去
  const text = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (char === '\r') {
        // \r\n の \r は無視（次の \n で改行）
        if (next !== '\n') {
          row.push(field);
          rows.push(row);
          row = [];
          field = '';
        }
      } else {
        field += char;
      }
    }
  }
  // 最終フィールド／行
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** 2次元配列をCSV文字列に変換（全セルを引用符で囲む）。Excel用にBOMは呼び出し側で付与 */
export function toCSV(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell === null || cell === undefined ? '' : String(cell);
          return `"${s.replace(/"/g, '""')}"`;
        })
        .join(',')
    )
    .join('\r\n');
}

/** ブラウザでCSVをダウンロードさせる（BOM付きUTF-8） */
export function downloadCSV(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = '﻿' + toCSV(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
