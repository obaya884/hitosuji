// デイリーのショートカット一覧（画面定義書01 §6）。**§6 の本表が正**で、キーを増減するときは
// §6 → この表 → ディスパッチャ の順に直す。§6 から転記するのは**キー表記・並び・ニーモニック由来**
// までで（`shortcuts.test.ts` が literal で固定する）、`description` は §6 の操作列を一覧パネル向けに
// 短くした表示文言——§6 が本文に持つ条件や `O-XX` / `§X` の参照は画面に出さない。
// ヘルプ一覧（`_components/shortcut-help.tsx`）はこの表から描き、ディスパッチャ
// （`_components/use-daily-shortcuts.ts`）のテストもここからキーを導く。**ディスパッチャの
// switch は挙動の分岐なのでここへは畳まない**。代わりに `use-daily-shortcuts.test.tsx` が
// 「表のキーが全部拾われる」「表に無いキーは拾われない」を両方向で固定し、片側だけに足す事故を防ぐ。

/**
 * keydown 1つぶん。使ってよい修飾キーは Shift だけ（00_共通 §3）なので Shift の有無だけ持つ。
 * **ショートカットに割り当てられたキーとは限らない**——テストは割り当ての無いキーもこの形で扱う
 */
export type KeyStroke = Readonly<{ key: string; shiftKey: boolean }>;

type Shortcut = Readonly<{
  /** 一覧のキー列の表記（§6 のキー列と同じ字面） */
  label: string;
  /**
   * `label` が表す実際のキー。**表記と実キーは1対1ではない**——`J / K` のように複数キーを
   * 1行にまとめる行や、`Shift+H / Shift+L / T` のように Shift の有無が混ざる行がある
   */
  keys: readonly KeyStroke[];
  description: string;
  /** ニーモニック由来（§6 本表の括弧書き）。由来のない行は持たない（表にない由来は創作しない） */
  mnemonic?: string;
}>;

const plain = (...keys: readonly string[]): readonly KeyStroke[] =>
  keys.map((key) => ({ key, shiftKey: false }));

/** Shift 併用。物理的に Shift を押して入るので `key` は大文字・記号側になる（`J` / `?`） */
const shift = (...keys: readonly string[]): readonly KeyStroke[] =>
  keys.map((key) => ({ key, shiftKey: true }));

export const SHORTCUTS: readonly Shortcut[] = [
  { label: "J / K", keys: plain("j", "k"), description: "選択行の移動" },
  {
    label: "N",
    keys: plain("n"),
    description: "現在地へジャンプ（実行中、なければ現在セクションの未実行）",
    mnemonic: "Now",
  },
  {
    label: "Enter",
    keys: plain("Enter"),
    description: "開始 →（実行中なら）終了 のトグル。完了タスクは複製して開始",
  },
  {
    label: "I",
    keys: plain("i"),
    description: "中断（実行中タスクのみ）",
    mnemonic: "Interrupt",
  },
  { label: "A", keys: plain("a"), description: "クイック追加欄へフォーカス", mnemonic: "Add" },
  { label: "R", keys: plain("r"), description: "タスク名編集", mnemonic: "Rename" },
  { label: "E", keys: plain("e"), description: "見積もり編集", mnemonic: "Estimate" },
  {
    label: "B / F",
    keys: plain("b", "f"),
    description: "開始時刻 / 終了時刻の修正",
    mnemonic: "Begin / Finish",
  },
  { label: "M", keys: plain("m"), description: "モードの選択", mnemonic: "Mode" },
  { label: "P", keys: plain("p"), description: "プロジェクトの選択", mnemonic: "Project" },
  { label: "S", keys: plain("s"), description: "セクションの選択", mnemonic: "Section" },
  {
    label: "C",
    keys: plain("c"),
    description: "コメントの編集（Shift+Enter で改行、Enter で確定）",
    mnemonic: "Comment",
  },
  { label: "H", keys: plain("h"), description: "ハイライトの付け外し", mnemonic: "Highlight" },
  {
    label: "Shift+J / Shift+K",
    keys: shift("J", "K"),
    description: "タスクの並び替え（下へ / 上へ）",
  },
  { label: "Y", keys: plain("y"), description: "選択タスクの複製", mnemonic: "Yank" },
  { label: "D", keys: plain("d"), description: "削除", mnemonic: "Delete" },
  {
    label: "U",
    keys: plain("u"),
    description: "取り消し（保留中の取り消しを優先 / 実行中は開始打刻 / 完了は未実行へ）",
    mnemonic: "Undo",
  },
  {
    label: "Shift+H / Shift+L / T",
    keys: [...shift("H", "L"), ...plain("t")],
    description: "前日 / 翌日 / 今日へ移動",
    // 由来があるのは末尾の `T` だけ（`Shift+H` / `Shift+L` は vim の左右移動から）
    mnemonic: "Today",
  },
  {
    label: "G",
    keys: plain("g"),
    description: "日付を選んでジャンプ（カレンダーを開く）",
    mnemonic: "Go to date",
  },
  { label: "?", keys: shift("?"), description: "この一覧の表示・非表示" },
];

/**
 * 表が割り当てている全キー（表示順）。**本番の呼び出し元は無く、公開しているのはテストが
 * 走査するため**（表内のキー重複の検査と、ディスパッチャとの両方向の突き合わせ）
 */
export const SHORTCUT_KEYS: readonly KeyStroke[] = SHORTCUTS.flatMap((shortcut) => shortcut.keys);
