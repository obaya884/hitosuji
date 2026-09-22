import { describe, expect, it } from "vitest";

import * as notices from "./notice-messages";
import {
  bundleDepartureMessage,
  EMPTY_BUNDLE_CANDIDATES,
  EMPTY_BUNDLE_MEMBERS,
  EMPTY_BUNDLES,
  routinizedMessage,
} from "./notice-messages";

/**
 * 文言を写したカタログ（`error-messages.test.ts` と同じ形）。**検出力のためではなく一覧のため**に
 * 置いている——辞書を1文字変えれば各画面のコンポーネントテストが落ちるので、落とす網はそちらが
 * 持つ。ここの値打ちは**文言の正が辞書の隣に並んで見えること**なので、「重複だから」と畳まない。
 */
const EXPECTED_MESSAGES = {
  EMPTY_BUNDLE_MEMBERS: "まだルーチンが入っていません",
  EMPTY_BUNDLES: "バンドルがありません",
  EMPTY_BUNDLE_CANDIDATES: "追加できるルーチンがありません",
  EMPTY_REVIEW_LOG: "実行したタスクはありません",
  EMPTY_REVIEW_POSTPONED: "先送りはありません",
  EMPTY_REVIEW_TOTALS: "集計する実績がありません",
  EMPTY_ROUTINES: "ルーチンはまだありません",
  EMPTY_PROJECTS: "プロジェクトはまだありません",
  EMPTY_MODES: "モードはまだありません",
  STALE_RUNNING_WARNING: "前日以前の実行中タスクがあります",
  STALE_UNSTARTED_WARNING: "前日以前に未実施のタスクが残っています",
  DELETE_CONFIRM: "本当に削除？",
  SAVING_NOTICE: "保存中",
} as const;

/** 変数を含む文言は関数で持つ。値は下の describe が見るので、ここでは在ることだけを数える */
const EXPECTED_BUILDERS = ["routinizedMessage", "bundleDepartureMessage"] as const;

describe("notice-messages（T-153: 状態を伝える文言の正は辞書とこの表）", () => {
  // エラー辞書と違い `Record<コード, string>` が無く**キー集合が型で閉じない**ので、
  // 定数や関数を足して上の表へ書き忘れても typecheck は通る。モジュール全体を1つの値として
  // 突き合わせることで、値の一致・書き忘れ・消し忘れを同時に見る（`export type` は
  // 実行時のキーに現れないので、型が増えてもここは壊れない）
  it("辞書が持つものは表のとおりで、増えても減ってもいない", () => {
    expect({ ...notices }).toEqual({
      ...EXPECTED_MESSAGES,
      ...Object.fromEntries(EXPECTED_BUILDERS.map((name) => [name, expect.any(Function)])),
    });
  });

  // 上の表は人が書き写すので、次に足す人が句点付きで書けば表もろとも通ってしまう。
  // 規約（画面定義書00_共通 §4）は**辞書の中身を走査して**守らせる。
  // **空状態の文言は `EMPTY_` で始める**——この走査が拾う範囲を名前で決めている
  it("空状態の文言は句点で終わらない（画面定義書00_共通 §4）", () => {
    const empties = Object.entries(notices).filter(([key]) => key.startsWith("EMPTY_"));

    // 接頭辞の付け忘れ・走査の空振りで素通りしないよう、拾えた件数も固定する
    expect(empties).toHaveLength(9);
    for (const [key, message] of empties) expect(message, key).not.toMatch(/。$/);
  });

  describe("変数を含む文言は値の差し込み位置まで見る", () => {
    it("ルーチン化の完了（画面定義書01 §4.1）", () => {
      expect(routinizedMessage("朝食")).toBe("「朝食」をルーチン化しました（明日から展開）");
    });

    it("バンドルの途中離脱（画面定義書01 §4.4）", () => {
      expect(bundleDepartureMessage("朝の立上げ", 3)).toBe("「朝の立上げ」が途中です（残り3件）");
    });
  });

  // 辞書に並ぶと表記ゆれに見えるが、**0件の理由が違う**ので意図的に語を分けている
  // （メンバー・バンドルは「まだ作っていない」、候補は「すべてどこかに属している」）。
  // `error-messages.test.ts` が MASTER と ROUTINE の `invalid_start_time` を固定しているのと同じ趣旨で、
  // 「揃えよう」と畳まれたらここで落とす
  it("候補ゼロはメンバーゼロ・バンドルゼロと語を揃えない", () => {
    expect(EMPTY_BUNDLE_CANDIDATES).not.toBe(EMPTY_BUNDLE_MEMBERS);
    expect(EMPTY_BUNDLE_CANDIDATES).not.toBe(EMPTY_BUNDLES);
  });
});
