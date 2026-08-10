import { describe, expect, it } from "vitest";
import type { Routine } from "../routine/routine";
import { routine } from "../routine/testing/routine";
import { bundleCandidates, bundleMembers } from "./members";

function names(routines: readonly Routine[]): string[] {
  return routines.map((r) => r.name);
}

describe("bundleMembers（画面定義書05 §3.2）", () => {
  it("指定バンドルのメンバーだけを開始想定時刻の昇順・同時刻は名前の自然順で返す", () => {
    const input = [
      routine({ id: 1, name: "わ", bundleId: 1, scheduledStartTime: "07:00" }),
      routine({ id: 2, name: "他バンドル", bundleId: 2, scheduledStartTime: "05:00" }),
      routine({ id: 3, name: "朝食", bundleId: 1, scheduledStartTime: "06:30" }),
      routine({ id: 4, name: "未所属", bundleId: null, scheduledStartTime: "05:30" }),
      routine({ id: 5, name: "あ", bundleId: 1, scheduledStartTime: "07:00" }),
    ];

    const result = bundleMembers(input, 1);

    expect(names(result)).toEqual(["朝食", "あ", "わ"]);
  });

  it("メンバーが1件も無ければ空配列を返す", () => {
    const input = [routine({ id: 1, bundleId: 2 })];

    expect(bundleMembers(input, 1)).toEqual([]);
  });

  it("無効ルーチンもメンバーに含める（所属は有効/無効を問わない）", () => {
    const input = [routine({ id: 1, bundleId: 1, isActive: false })];

    expect(bundleMembers(input, 1)).toHaveLength(1);
  });
});

describe("bundleCandidates（画面定義書05 O-5）", () => {
  it("未所属（bundleId === null）のルーチンだけを開始想定時刻の昇順で返す", () => {
    const input = [
      routine({ id: 1, name: "所属あり", bundleId: 3, scheduledStartTime: "05:00" }),
      routine({ id: 2, name: "い", bundleId: null, scheduledStartTime: "07:00" }),
      routine({ id: 3, name: "あ", bundleId: null, scheduledStartTime: "06:00" }),
    ];

    const result = bundleCandidates(input);

    expect(names(result)).toEqual(["あ", "い"]);
  });

  it("無効ルーチンも候補に含める（後で有効化しうるため。O-5）", () => {
    const input = [routine({ id: 1, bundleId: null, isActive: false })];

    expect(bundleCandidates(input)).toHaveLength(1);
  });

  it("同時刻は名前の自然順（bundleMembers と同じ比較規則を共有する）", () => {
    const input = [
      routine({ id: 1, name: "わ", bundleId: null, scheduledStartTime: "07:00" }),
      routine({ id: 2, name: "あ", bundleId: null, scheduledStartTime: "07:00" }),
    ];

    expect(names(bundleCandidates(input))).toEqual(["あ", "わ"]);
  });
});
