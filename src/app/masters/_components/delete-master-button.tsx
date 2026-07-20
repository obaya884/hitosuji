"use client";

// 物理削除の2段階ボタン（画面定義書03 §4.1）。
// モーダルは使わず、同じ位置で「削除」→「本当に削除？ [削除する] [取消]」に切り替える
import { useState } from "react";
import { linkDanger, linkMuted } from "@/app/_lib/ui";

type Props = Readonly<{
  onDelete: () => void;
  disabled: boolean;
}>;

export function DeleteMasterButton({ onDelete, disabled }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className={`px-2 ${linkMuted}`}>
        削除
      </button>
    );
  }

  return (
    <span className="whitespace-nowrap">
      <span className="text-xs text-ink-muted">本当に削除？</span>
      <button
        onClick={() => {
          setConfirming(false);
          onDelete();
        }}
        disabled={disabled}
        className={`px-2 ${linkDanger}`}
      >
        削除する
      </button>
      <button onClick={() => setConfirming(false)} className={`px-2 ${linkMuted}`}>
        取消
      </button>
    </span>
  );
}
