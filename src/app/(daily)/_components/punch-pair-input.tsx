"use client";

import { useRef, type FocusEvent, type KeyboardEvent } from "react";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { inputBase } from "@/app/_lib/ui";

type Props = Readonly<{
  /** 押したキーの側（`B` = 開始 / `F` = 終了）。その欄にフォーカスして開く */
  focus: "startedAt" | "endedAt";
  /** 2つとも入ったときだけ呼ぶ。値は入力のまま（解釈と検証は呼び出し側） */
  onCommit: (startHhmm: string, endHhmm: string) => void;
  /** 何も送らずに閉じる（`Esc`・片方が空のままフォーカスが外へ出たとき） */
  onCancel: () => void;
}>;

/**
 * 未実行のタスクに開始と終了をまとめて入れる欄（画面定義書01 §3.3 ④）。どちらも空欄で開く。
 * 確定の規則は §8「開始と終了をまとめて入れる欄で片方が空」: `Enter` は片方が空なら空の側へ
 * フォーカスを移し、2つの欄の外へフォーカスが出たら（2つのあいだの移動は除く）、そろっていれば確定・
 * 欠けていれば破棄する（画面定義書00 §2.3 の「フォーカスが外れたら確定」を2欄で1つの入力として当てる）
 */
export function PunchPairInput({ focus, onCommit, onCancel }: Props) {
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  // Enter・Esc で閉じたあとに続いて届く blur で二重に確定しないための印
  const settled = useRef(false);

  /** 2つそろっていれば確定して true。欠けていれば false（呼び出し側が次の動きを決める） */
  function commitIfComplete(): boolean {
    const start = startRef.current?.value.trim() ?? "";
    const end = endRef.current?.value.trim() ?? "";
    if (start === "" || end === "") return false;
    settled.current = true;
    onCommit(start, end);
    return true;
  }

  function cancel() {
    settled.current = true;
    onCancel();
  }

  // 組み立てはイベント時に行う（描画中に組むと ref を読む関数を描画中に渡す形になる。react-hooks/refs）
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    inlineEditKeyHandler<HTMLInputElement>({
      onEnter: () => {
        if (commitIfComplete()) return;
        const empty = startRef.current?.value.trim() === "" ? startRef.current : endRef.current;
        empty?.focus();
      },
      onEscape: cancel,
    })(e);
  }

  function onBlur(e: FocusEvent<HTMLSpanElement>) {
    if (settled.current) return;
    // 2つの欄のあいだの移動は外へ出たとみなさない
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    if (!commitIfComplete()) cancel();
  }

  const field = (ref: typeof startRef, side: Props["focus"], label: string) => (
    <input
      ref={ref}
      autoFocus={focus === side}
      aria-label={label}
      onKeyDown={onKeyDown}
      placeholder="1935"
      className={`w-16 text-right ${inputBase}`}
    />
  );

  return (
    <span onBlur={onBlur} className="inline-flex items-center gap-1">
      {field(startRef, "startedAt", "開始時刻")}–{field(endRef, "endedAt", "終了時刻")}
    </span>
  );
}
