// 行の見た目のうち「モードから決まる分」（F-401）。デイリー（画面定義書01 §3.3）と
// レビュー（画面定義書04 §2「モード色は S-01 と同じ」）が同じ規則を使うので `_lib/` に置く
// （アーキテクチャ定義書 §2: 2つ目の利用者が現れた時点で1つ上へ引き上げる）。
import type { CSSProperties } from "react";
import type { Mode } from "@/domain/mode/mode";

export type ModeAppearance = Readonly<{
  /** モード未設定の行か（＝副次情報の色にする行。画面定義書01 §3.3「モード未設定行の色」） */
  isDimmed: boolean;
  /** 上の判定をクラス名にしたもの。真偽で受け取るセル（`AssignCell`）以外はこちらを使う */
  dimmedClass: string;
  /** モード色を行全体のテキスト色に載せる（未設定なら何も載せない。F-401） */
  colorStyle: CSSProperties;
}>;

/**
 * モード設定時は行の色を継承させ、未設定時のみ既定のグレーにする（F-401 / 画面定義書01 §3.3）。
 * どのセルを副次情報の色にするかは同書 §3.3「モード未設定行の色」が正で、対象の選び方は行側が持つ
 */
export function modeAppearance(mode: Mode | undefined): ModeAppearance {
  const isDimmed = mode === undefined;
  return {
    isDimmed,
    dimmedClass: toDimmedClass(isDimmed),
    colorStyle: mode === undefined ? {} : { color: mode.color },
  };
}

/** 副次情報の色。判定（真偽）だけを受け取る側（`AssignCell`）のための入口 */
export function toDimmedClass(isDimmed: boolean): string {
  return isDimmed ? "text-ink-muted" : "";
}
