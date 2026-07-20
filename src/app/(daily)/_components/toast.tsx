"use client";

import { useEffect } from "react";

export type ToastVariant = "undo" | "error";

// 表示時間はトーストの種類で決める（画面定義書01 §8: Undo付き5秒 / エラー8秒）。
// 自動消去のタイマーはこのコンポーネントに一元化する（呼び出し側では持たない）
const AUTO_DISMISS_MS: Readonly<Record<ToastVariant, number>> = {
  undo: 5000,
  error: 8000,
};

/**
 * トースト1件分の見た目。取り消し等のアクションを1つだけ添えられる。
 * すべてのトーストは自動で消え（種類ごとの表示時間は上記）、閉じるボタン（×）でも消せる（FB-15）。
 * 呼び出し側はトーストが入れ替わるたびに `key` を変えて再マウントさせること
 * （タイマーはマウント時に1本だけ張るため、再マウントしないと表示時間が延長されない）。
 * 画面下部中央への配置は呼び出し側がまとめて行う（複数トースト同時表示時に重ならないようにするため）
 */
export function Toast({
  message,
  variant = "undo",
  actionLabel,
  onAction,
  onClose,
}: Readonly<{
  message: string;
  variant?: ToastVariant;
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
}>) {
  useEffect(() => {
    const timeoutId = setTimeout(onClose, AUTO_DISMISS_MS[variant]);
    return () => clearTimeout(timeoutId);
    // マウント時に1本だけ張る。onClose・variant は呼び出し元の再レンダリングのたびに
    // 新しい参照になり得るため、依存配列に含めるとタイマーが消えるまで再起動し続けてしまう
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`flex items-center gap-3 rounded-float px-4 py-2 text-sm text-paper shadow-float ${
        // エラーは地色で区別する（Undo の通知と同じ見た目だと失敗に気づきにくいため）
        variant === "error" ? "bg-danger" : "bg-ink"
      }`}
    >
      <span>{message}</span>
      {actionLabel !== undefined && (
        <button
          type="button"
          onClick={onAction}
          className="font-medium text-white underline hover:no-underline"
        >
          {actionLabel}
        </button>
      )}
      {/* 閉じるボタン（×）。すべてのトーストは手動でも消せる（画面定義書01 §8） */}
      <button
        type="button"
        onClick={onClose}
        aria-label="閉じる"
        className="text-paper/70 hover:text-paper"
      >
        ×
      </button>
    </div>
  );
}
