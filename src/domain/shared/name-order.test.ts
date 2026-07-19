import { describe, expect, it } from "vitest";
import { sortByName } from "./name-order";

describe("sortByName（画面定義書03 §4: name 昇順・自然順ソート）", () => {
  it("数値接頭辞を数値として比較する（01 < 02 < 10）", () => {
    const items = [{ name: "10.雑務" }, { name: "02.家庭" }, { name: "01.仕事" }];
    expect(sortByName(items).map((i) => i.name)).toEqual(["01.仕事", "02.家庭", "10.雑務"]);
  });

  it("接頭辞なしの名前も昇順に並ぶ", () => {
    const items = [{ name: "ぶどう" }, { name: "あんず" }];
    expect(sortByName(items).map((i) => i.name)).toEqual(["あんず", "ぶどう"]);
  });

  it("元の配列を変更しない", () => {
    const items = [{ name: "b" }, { name: "a" }];
    sortByName(items);
    expect(items.map((i) => i.name)).toEqual(["b", "a"]);
  });
});
