// UIのクラス規約。ボタン・入力・浮遊面の見た目はここで一元管理し、
// 各コンポーネントは className にこれらを埋め込む（コンポーネント化はしない）。
//
// ホバーの合図は「押せる範囲がどう区切られているか」で決める（00_共通 §2.5。面＝背景 /
// 語＝下線）。`btn*` と `link*` の `disabled:` はその合図を**保存中の一時的な無効**で
// 打ち消すもので、濃淡は変えない（恒久的な無効は下の `disabledPermanent`）。

/**
 * 本文の文字サイズの段（00_共通 §1.1）。**サイズを受け取る口は `string` で開けない**
 * ——`globals.css` が段外のトークンを潰しても、受け口が `string` なら呼び出し側から
 * 段外のクラス名を渡せてしまい、規律が境界で抜ける。
 *
 * **見出し段（h1）は含めない**——画面に1つだけ立つ札で、本文の中で選ぶものではないため
 */
export const BODY_TEXT_STEPS = ["text-main", "text-sub", "text-meta"] as const;

export type BodyTextStep = (typeof BODY_TEXT_STEPS)[number];

// ホバーの合図の断片（00_共通 §2.5）。**下の部品定数に載らない押せる要素**——一覧の名前・
// 列見出し・ポップオーバーの候補・日付ピッカーの日など、それぞれ固有のクラスを持つもの——が
// 自分のクラスに足して使う。`linkAccent` のような完成品を当てると色やサイズまで上書きして
// しまうため、合図だけを切り出してある。**直書きは `eslint.config.mjs` が禁じている**。
// アイコン・ナビはここに無い（同書 §2.5・lint の対象外）。
//
// `disabled:` を必ず組にしているのは、保存中の一時的な無効では**合図を出さないだけ**にする
// 規約を押せる要素すべてで満たすため。無効にならない要素に載っても効かないが、あとから
// `disabled` を足したときに追随を忘れずに済む。

/** 語の合図: 下線を出す。文字色は変えない */
export const hoverWord = "hover:underline disabled:no-underline";

/**
 * 面の合図: 弱いアクセント面を敷く。保存中は敷かない。
 * **無効になりうる要素では、地色を持たないこと**——戻し先が `transparent` なので、
 * 地色を持つ要素に付けると無効時のホバーでその地色まで消える。地色を持つ要素を無効にするなら
 * 下の `hoverSurfaceOnAccent` か、戻し先を自分で書く（`btnSecondary` がその形）
 */
export const hoverSurface = "hover:bg-accent-weak disabled:hover:bg-transparent";

/** `bg-accent` を持つ面の合図: 地色を一段濃くし、保存中は元の地色へ戻す */
export const hoverSurfaceOnAccent = "hover:bg-accent-hover disabled:hover:bg-accent";

export const btnPrimary = `rounded-control bg-accent px-3 py-1 text-sub font-medium text-white ${hoverSurfaceOnAccent}`;

// 戻し先が `bg-surface`（自分の地色）なので上の断片に載らない——`hoverSurface` は
// 地色を持たない要素向けで、当てると無効時のホバーで地色が消える
export const btnSecondary =
  "rounded-control border border-line bg-surface px-3 py-1 text-sub text-ink hover:bg-accent-weak disabled:hover:bg-surface";

// 部品（リンク状のボタン・入力欄）は本文のサイズを継承させず自分で持つ
// ——本文は見出し/主/従/メタの4段（00_共通 §1.1）だが、部品はその外側なので継承すると置かれた場所で大小が変わる
export const linkAccent = `text-sub text-accent ${hoverWord}`;

// 副次的な操作リンク（アーカイブ・復元・外す等）。色は地味なままホバーでは下線を出す
// ——地の色が薄いぶん色の変化量が小さく、押せることの合図として弱いため（FB-100）
export const linkMuted = `text-sub text-ink-muted ${hoverWord}`;

// 取り消せない操作（マスタの物理削除）の確定ボタン
export const linkDanger = `text-sub text-danger ${hoverWord}`;

// 恒久的な無効（いまの状態では押せない）の薄さ（00_共通 §2.5）。
// **`disabled:` の擬似クラスでは使わない**——同じ属性に保存中の無効も乗るため書き分けられない
export const disabledPermanent = "opacity-40";

export const inputBase =
  "rounded-control border border-line bg-surface px-2 py-1 text-sub text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none";

export const floatPanel =
  // text-ink を明示し、行のモード色（F-401）を継承しないようにする（FB-38）
  "rounded-float border border-line bg-surface text-ink shadow-float";

// 一覧の列見出しの文字。見出しは従段で、主従は色で示す（00_共通 §1.1）
export const tableHeadText = "text-left text-sub text-ink-muted";

/**
 * 一覧の列見出しの下罫線。**行を固定する表ではセル側に付ける**——`border-collapse: collapse`
 * では罫線が行に属し、`position: sticky` のセルと一緒に動かないため、貼り付いた瞬間に
 * 線だけが元の位置へ取り残される（画面定義書01 §2 の3段固定）
 */
export const tableHeadRule = "border-b border-line-strong";

// 一覧の列見出し行（固定しない表はこれ1つで足りる）
export const tableHeadRow = `${tableHeadText} ${tableHeadRule}`;

// 重なり順の全体像（数字が大きいほど手前）。**新しく積むときはこの一覧に足す**——
// 各コンポーネントに散らすと、どれがどれより上かが1か所からは読めなくなる。
//   z-30    モーダル（00_共通 §2.3）
//   z-20    トースト・進行中の合図・ツールチップ（同書 §2.2 / §4.2）
//   z-10    画面上部の固定領域（板）／ポップオーバー・行メニュー等の浮遊面（同書 §2.1）
//   z-2     貼り付いた列見出し行（画面定義書01 §2）
//   z-1     貼り付いたセクション見出し行（同上。浮遊面より下・通常の行より上）
//   指定なし 通常の行

// 確定を待つ操作の進行中の合図（00_共通 §4.2）。これは結果ではなく経過なので、
// トーストの濃い地色は使わず浮遊面＋副次情報の色で結果の通知より弱くする
export const pendingNotice =
  "rounded-float border border-line bg-surface px-4 py-2 text-sub text-ink-muted shadow-float";

// 画面下部中央の浮遊置き場。トースト（00_共通 §2.2）と進行中の合図（§4.2）が
// 同じ場所に出るため、重ならないよう1つの列に積む
export const bottomCenterStack =
  "fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2";

// 乗せたものの名前を出す小さな吹き出し（プリセット色の色名・バンドルの道のバンドル名）。
// **面の見た目だけを持ち、どの辺に出すかは呼び出し側が位置クラスで足す**（置き場所ごとに違う）
export const tooltipBubble =
  "pointer-events-none absolute z-20 rounded-control bg-ink px-1.5 py-0.5 text-meta whitespace-nowrap text-paper";

// エラー・警告の帯（Server Action の失敗、前日以前の実行中タスク等）
export const noticeDanger =
  "rounded-control border border-danger-line bg-danger-weak px-3 py-2 text-sub text-danger";
