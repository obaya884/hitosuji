// UIのクラス規約。ボタン・入力・浮遊面の見た目はここで一元管理し、
// 各コンポーネントは className にこれらを埋め込む（コンポーネント化はしない）。

export const btnPrimary =
  "rounded-control bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent-hover";

export const btnSecondary =
  "rounded-control border border-line bg-surface px-3 py-1 text-sm text-ink hover:bg-accent-weak";

export const linkAccent = "text-accent hover:underline";

export const linkMuted = "text-ink-muted hover:text-ink";

export const inputBase =
  "rounded-control border border-line bg-surface px-2 py-1 text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none";

export const floatPanel =
  "rounded-float border border-line bg-surface shadow-float";

// エラー・警告の帯（Server Action の失敗、前日以前の実行中タスク等）
export const noticeDanger =
  "rounded-control border border-danger-line bg-danger-weak px-3 py-2 text-sm text-danger";
