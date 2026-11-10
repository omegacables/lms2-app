'use client';

// 件数の多い一覧の検索欄。
// 打った文字はこの部品の中だけですぐに表示し、一覧の絞り込み（親の画面の作り直し）は、
// 入力が少し止まってから「急がない更新」として行う。
// 1文字ごとに画面全体を作り直すと、件数の多い画面で入力が引っかかる（INP が悪くなる）ため。
//
// - value   ：親が持っている検索語。親が外から変えたとき（「フィルターをクリア」など）は入力欄も合わせる
// - onSearch：入力が止まってから delay ミリ秒後に、入力欄の文字で呼ぶ

import { startTransition, useEffect, useRef, useState } from 'react';

type SearchInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onSearch: (value: string) => void;
  /** 入力が止まってから絞り込みを始めるまでの時間（ミリ秒） */
  delay?: number;
};

export function SearchInput({ value, onSearch, delay = 200, ...rest }: SearchInputProps) {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 親に伝えたが、まだ親から value として戻ってきていない値
  const sent = useRef<string[]>([]);
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  useEffect(() => {
    const i = sent.current.lastIndexOf(value);
    if (i >= 0) {
      // 自分が伝えた値が戻ってきただけ。その間に打った文字を消さないよう、入力欄はそのままにする
      sent.current = sent.current.slice(i + 1);
      return;
    }
    // 親が外から変えた → 待っている絞り込みをやめて、入力欄を合わせる
    sent.current = [];
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setText(value);
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      sent.current.push(next);
      // 絞り込みは急がない更新にする（途中でまた文字を打っても、入力を待たせない）
      startTransition(() => onSearchRef.current(next));
    }, delay);
  };

  return <input {...rest} type="text" value={text} onChange={handleChange} />;
}
