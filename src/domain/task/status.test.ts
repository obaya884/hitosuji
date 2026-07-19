import { describe, expect, it } from "vitest";
import { taskStatus } from "./status";

describe("taskStatus — 打刻からの状態導出", () => {
  it("打刻なしは未実行", () => {
    expect(taskStatus({ startedAt: null, endedAt: null })).toBe("not_started");
  });

  it("開始打刻のみは実行中", () => {
    expect(
      taskStatus({ startedAt: new Date("2026-07-19T09:00:00+09:00"), endedAt: null })
    ).toBe("running");
  });

  it("終了打刻ありは完了", () => {
    expect(
      taskStatus({
        startedAt: new Date("2026-07-19T09:00:00+09:00"),
        endedAt: new Date("2026-07-19T09:30:00+09:00"),
      })
    ).toBe("completed");
  });
});
