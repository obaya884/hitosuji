// 繰り返しの入力欄（ルーチン管理のフォームとルーチン化ポップオーバー）が共有する表記。
// 同じ入力欄の表記を経路で揃えるため1か所に置く。辞書（`notice-messages.ts`）の対象外（00_共通 §4）。
// 一覧の要約表示（「隔週(火)」等）は `domain/routine/routine.ts` の `describeRecurrence` が持つ。

import type { RecurrenceType } from "@/domain/routine/routine";

/**
 * 繰り返し種別のラジオのラベル（画面定義書02 §4 / 01 §4.1）。キーの並びがそのまま
 * 選択肢の並びになる
 */
export const RECURRENCE_LABELS: Readonly<Record<RecurrenceType, string>> = {
  daily: "毎日",
  weekly: "週次",
  monthly: "月次",
  interval: "n日ごと",
};

/** 週間隔の入力欄の注記（画面定義書02 §4 / 01 §4.1） */
export const WEEK_INTERVAL_NOTE = "週おき（1=毎週・2=隔週）";
