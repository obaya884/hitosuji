// UIのクラス規約。ボタン・入力・浮遊面の見た目はここで一元管理し、
// 各コンポーネントは className にこれらを埋め込む（コンポーネント化はしない）。

export const btnPrimary =
  "rounded-control bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent-hover";

export const btnSecondary =
  "rounded-control border border-line bg-surface px-3 py-1 text-sm text-ink hover:bg-accent-weak";

// リンク状のボタン（行の操作列など）。本文のサイズを継承させず自分で持つ
// ——本文は主/従/メタの3段（00_共通 §1.1）だが、部品はその外側なので継承すると行ごとに大小が変わる
export const linkAccent = "text-sm text-accent hover:underline";

export const linkMuted = "text-sm text-ink-muted hover:text-ink";

// 取り消せない操作（マスタの物理削除）の確定ボタン
export const linkDanger = "text-sm text-danger hover:underline";

export const inputBase =
  "rounded-control border border-line bg-surface px-2 py-1 text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none";

export const floatPanel =
  // text-ink を明示し、行のモード色（F-401）を継承しないようにする（FB-38）
  "rounded-float border border-line bg-surface text-ink shadow-float";

// エラー・警告の帯（Server Action の失敗、前日以前の実行中タスク等）
export const noticeDanger =
  "rounded-control border border-danger-line bg-danger-weak px-3 py-2 text-sm text-danger";
