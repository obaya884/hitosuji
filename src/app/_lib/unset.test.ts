import { describe, expect, it } from "vitest";
import {
  UNCATEGORIZED_LABEL,
  UNSET_GROUP_LABEL,
  UNSET_LABEL,
  UNSET_MARK,
  UNSET_TIME_MARK,
} from "./unset";

// 語彙そのものが条項なので、値をここで固定する（記号は FB-55、語は FB-57。
// 同じ意味が空欄と `-`、「モードなし」「なし」「未設定」「（未設定）」へ割れた事故の再発防止）。
// 各画面のテストは「この語が出ること」を見るだけで、文字列を書き直さない
describe("未設定の語彙（画面定義書00_共通 §2.4）", () => {
  it("一覧のセルは属性が `-`・時間の値が `--:--` で、記号を使い分ける", () => {
    expect(UNSET_MARK).toBe("-");
    expect(UNSET_TIME_MARK).toBe("--:--");
  });

  it("語は「未設定」1つで、属性名を冠さない", () => {
    expect(UNSET_LABEL).toBe("未設定");
  });

  it("集計のグループ行は同じ語を括弧でくくったラベル", () => {
    expect(UNSET_GROUP_LABEL).toBe("（未設定）");
  });

  // 「未分類」は値の不在ではなくインボックスグループの名前なので、上の「未設定」に揃えない
  it("セクションの `null` は「未分類」のまま（§2.4 の対象外）", () => {
    expect(UNCATEGORIZED_LABEL).toBe("未分類");
  });
});
