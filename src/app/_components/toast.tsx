"use client";

// 画面下部中央のトースト。取り消し等のアクションを1つだけ添えられる
export function Toast({
  message,
  actionLabel,
  onAction,
}: Readonly<{
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}>) {
  return (
    <div className="fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-float bg-ink px-4 py-2 text-sm text-paper shadow-float">
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
    </div>
  );
}
