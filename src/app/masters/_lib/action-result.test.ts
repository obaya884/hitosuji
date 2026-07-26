import { describe, expect, it } from "vitest";

import { failure, type MasterError } from "./action-result";

/**
 * エラーコード → 画面に出す日本語メッセージの対応（画面定義書03 §3.1 のバリデーション・
 * §3.2 の色プリセット・§4.1 の物理削除）。`Record<MasterError, string>` にしているので、
 * ドメインへエラーコードを足したらこのテストが型エラーで落ちる（文言の決め忘れを防ぐ）
 */
const EXPECTED: Record<MasterError, string> = {
  name_required: "名前を入力してください",
  name_too_long: "名前は50文字以内で入力してください",
  invalid_start_time: "開始時刻を HH:MM 形式で入力してください",
  duplicate_start_time: "同じ開始時刻の有効なセクションがあります",
  last_active_section: "有効なセクションは最低1件必要です",
  day_start_section:
    "日界セクションはアーカイブできません（先に別のセクションを日界に指定してください）",
  invalid_color: "色はプリセットから選択してください",
  not_found: "対象が見つかりません（画面を再読み込みしてください）",
  not_archived: "削除できるのはアーカイブ済みのものだけです",
  has_references: "参照しているデータがあるため削除できません",
};

describe("failure（画面定義書03: ドメインのエラーコードを表示用メッセージへ変換する）", () => {
  for (const [code, message] of Object.entries(EXPECTED) as ReadonlyArray<
    [MasterError, string]
  >) {
    it(`${code} を「${message}」として失敗で返す`, () => {
      expect(failure(code)).toEqual({ ok: false, message });
    });
  }

  it("参照元の種類（タスク・ルーチン）を挙げずに言い切る（参照元はマスタごとに違う。§4.1）", () => {
    expect(failure("has_references")).toEqual({
      ok: false,
      message: expect.not.stringMatching(/タスク|ルーチン/),
    });
  });
});
