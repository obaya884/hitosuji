// UIのクラス規約。ボタン・入力・浮遊面の見た目はここで一元管理し、
// 各コンポーネントは className にこれらを埋め込む（コンポーネント化はしない）。
//
// ホバーの合図は「押せる範囲がどう区切られているか」で決める（00_共通 §2.5。面＝背景 /
// 語＝下線）。`btn*` と `link*` の `disabled:` はその合図を**保存中の一時的な無効**で
// 打ち消すもので、濃淡は変えない（恒久的な無効は下の `disabledPermanent`）。

export const btnPrimary =
  "rounded-control bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent-hover disabled:hover:bg-accent";

export const btnSecondary =
  "rounded-control border border-line bg-surface px-3 py-1 text-sm text-ink hover:bg-accent-weak disabled:hover:bg-surface";

// 部品（リンク状のボタン・入力欄）は本文のサイズを継承させず自分で持つ
// ——本文は主/従/メタの3段（00_共通 §1.1）だが、部品はその外側なので継承すると置かれた場所で大小が変わる
export const linkAccent = "text-sm text-accent hover:underline disabled:no-underline";

// 副次的な操作リンク（アーカイブ・復元・外す等）。色は地味なままホバーでは下線を出す
// ——地の色が薄いぶん色の変化量が小さく、押せることの合図として弱いため（FB-100）
export const linkMuted = "text-sm text-ink-muted hover:underline disabled:no-underline";

// 取り消せない操作（マスタの物理削除）の確定ボタン
export const linkDanger = "text-sm text-danger hover:underline disabled:no-underline";

// 恒久的な無効（いまの状態では押せない）の薄さ（00_共通 §2.5）。
// **`disabled:` の擬似クラスでは使わない**——同じ属性に保存中の無効も乗るため書き分けられない
export const disabledPermanent = "opacity-40";

export const inputBase =
  "rounded-control border border-line bg-surface px-2 py-1 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none";

export const floatPanel =
  // text-ink を明示し、行のモード色（F-401）を継承しないようにする（FB-38）
  "rounded-float border border-line bg-surface text-ink shadow-float";

// 一覧の列見出し行。見出しは従段で、主従は色で示す（00_共通 §1.1）
export const tableHeadRow = "border-b border-line-strong text-left text-sm text-ink-muted";

// 確定を待つ操作の進行中の合図（00_共通 §4.2）。これは結果ではなく経過なので、
// トーストの濃い地色は使わず浮遊面＋副次情報の色で結果の通知より弱くする
export const pendingNotice =
  "rounded-float border border-line bg-surface px-4 py-2 text-sm text-ink-muted shadow-float";

// 画面下部中央の浮遊置き場。トースト（00_共通 §2.2）と進行中の合図（§4.2）が
// 同じ場所に出るため、重ならないよう1つの列に積む
export const bottomCenterStack =
  "fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2";

// 乗せたものの名前を出す小さな吹き出し（プリセット色の色名・バンドルの道のバンドル名）。
// **面の見た目だけを持ち、どの辺に出すかは呼び出し側が位置クラスで足す**（置き場所ごとに違う）
export const tooltipBubble =
  "pointer-events-none absolute z-20 rounded-control bg-ink px-1.5 py-0.5 text-xs whitespace-nowrap text-paper";

// エラー・警告の帯（Server Action の失敗、前日以前の実行中タスク等）
export const noticeDanger =
  "rounded-control border border-danger-line bg-danger-weak px-3 py-2 text-sm text-danger";
