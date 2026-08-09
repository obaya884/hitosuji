/**
 * プリセット13色（画面定義書03 §3.2 の表と1:1。12色＋グレー。自由入力は設けない。N-05）。
 * **モード（F-401）とバンドル（F-119）が共有する**——色の意味は行ごとの文脈で決まるので、
 * 選べる色を2系統に増やさない（データモデル定義書 §3.7）。
 * 色値と色名は必ずここで対にする（別々のリストに分けると片方だけ増えて色名が静かに落ちる）
 */
export const COLOR_PRESETS = [
  { value: "#ef4444", name: "赤" },
  { value: "#f97316", name: "オレンジ" },
  { value: "#f59e0b", name: "琥珀" },
  { value: "#eab308", name: "黄" },
  { value: "#84cc16", name: "ライム" },
  { value: "#22c55e", name: "緑" },
  { value: "#14b8a6", name: "ティール" },
  { value: "#06b6d4", name: "シアン" },
  { value: "#3b82f6", name: "青" },
  { value: "#6366f1", name: "インディゴ" },
  { value: "#a855f7", name: "紫" },
  { value: "#ec4899", name: "ピンク" },
  { value: "#9ca3af", name: "グレー" },
] as const;

type ColorName = (typeof COLOR_PRESETS)[number]["name"];

/**
 * プリセットの色値だけを並べたもの（並びは画面定義書03 §3.2 の表と同じ）。
 * 本番の呼び出し元は同ファイル内の `isPresetColor` だけで、公開しているのは
 * テストがプリセット集合を走査するため（シードの色がプリセットに収まっているかの検査）
 */
export const COLOR_VALUES: readonly string[] = COLOR_PRESETS.map((p) => p.value);

/**
 * 色名から色値を引く（初期データは色を名前で指定する。データモデル定義書 §5）。
 * 逆向きの `colorPresetName` が関数なのに対しこちらを Record にしているのは、
 * 呼び手が定数（`COLOR_BY_NAME["青"]`）で引くため色名の打ち間違いを型で弾きたいから
 */
export const COLOR_BY_NAME = Object.fromEntries(
  COLOR_PRESETS.map((p) => [p.name, p.value] as const)
) as Readonly<Record<ColorName, string>>;

export function isPresetColor(color: string): boolean {
  return COLOR_VALUES.includes(color);
}

/** 色名を返す。未知の色（プリセット外）でも落ちず、hex 値をそのまま返す */
export function colorPresetName(color: string): string {
  return COLOR_PRESETS.find((p) => p.value === color)?.name ?? color;
}
