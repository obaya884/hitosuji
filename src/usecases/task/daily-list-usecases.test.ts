import { describe, expect, it } from "vitest";
import { TEST_DATE } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import { createInMemoryBundleRepository } from "@/usecases/bundle/testing/in-memory-repository";
import { inMemoryTaskRepository as inMemoryRepo } from "./testing/in-memory-repository";
import type { ModeRepository } from "@/usecases/ports/mode-repository";
import type { ProjectRepository } from "@/usecases/ports/project-repository";
import type { SectionRepository } from "@/usecases/ports/section-repository";
import type { TaskRepository } from "@/usecases/ports/task-repository";
import {
  addTask,
  listDailyList,
  renameTask,
  setTaskHighlight,
  setTaskMode,
  setTaskProject,
  updateTaskComment,
  updateTaskEstimate,
} from "./daily-list-usecases";

const emptySectionRepo: SectionRepository = {
  listAll: async () => [],
  create: async () => ({ id: 1, name: "", startTime: "00:00", isArchived: false }),
  update: async () => {},
  setArchived: async () => {},
  setDayStart: async () => {},
  referenceCounts: async () => ({}),
  remove: async () => {},
};
const emptyModeRepo: ModeRepository = {
  listAll: async () => [],
  create: async () => ({ id: 1, name: "", color: "#000000", isArchived: false }),
  update: async () => {},
  setArchived: async () => {},
  referenceCounts: async () => ({}),
  remove: async () => {},
};
const emptyProjectRepo: ProjectRepository = {
  listAll: async () => [],
  create: async () => ({ id: 1, name: "", isArchived: false }),
  update: async () => {},
  setArchived: async () => {},
  referenceCounts: async () => ({}),
  remove: async () => {},
};
const emptyBundleRepo = createInMemoryBundleRepository();

describe("addTask（F-102 / 画面定義書01 §3.4: クイック追加）", () => {
  it("タスク名のみで、見積もり未設定・未実行・未分類のタスクを作る", async () => {
    const repo = inMemoryRepo();
    const result = await addTask(repo, { date: TEST_DATE, name: "買い出しメモ" });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        taskDate: TEST_DATE,
        name: "買い出しメモ",
        estimateMinutes: 0,
        sectionId: null,
        modeId: null,
        projectId: null,
        startedAt: null,
        endedAt: null,
      }),
    });
  });

  it("未分類グループの末尾へ置く（sort_order は未分類の最大値+1000）", async () => {
    const repo = inMemoryRepo([
      task({ id: 1, sectionId: null, sortOrder: 2000 }),
      task({ id: 2, sectionId: 5, sortOrder: 9000 }), // 別セクションの値には影響されない
    ]);
    const result = await addTask(repo, { date: TEST_DATE, name: "新タスク" });
    expect(result.ok && result.value.sortOrder).toBe(3000);
  });

  it("他の日付のタスクは採番に影響しない（task_date ごとに独立）", async () => {
    const repo = inMemoryRepo([task({ id: 1, taskDate: "2026-07-25", sortOrder: 8000 })]);
    const result = await addTask(repo, { date: TEST_DATE, name: "新タスク" });
    expect(result.ok && result.value.sortOrder).toBe(1000);
  });

  it("空白のみの名前では作らない（§8: 何もしない）", async () => {
    const repo = inMemoryRepo();
    expect(await addTask(repo, { date: TEST_DATE, name: "   " })).toEqual({
      ok: false,
      error: "name_required",
    });
    expect(repo.rows).toHaveLength(0);
  });

  it("名前の前後の空白は除去する", async () => {
    const repo = inMemoryRepo();
    const result = await addTask(repo, { date: TEST_DATE, name: " 朝食 " });
    expect(result.ok && result.value.name).toBe("朝食");
  });
});

describe("renameTask（F-102: タスク名のインライン編集）", () => {
  it("前後の空白を除いて改名する", async () => {
    const repo = inMemoryRepo([task({ id: 1, name: "旧名" })]);
    expect((await renameTask(repo, 1, " 新名 ")).ok).toBe(true);
    expect(repo.rows[0].name).toBe("新名");
  });

  it("空の名前では改名しない（§8: 確定不可）", async () => {
    const repo = inMemoryRepo([task({ id: 1, name: "旧名" })]);
    expect(await renameTask(repo, 1, "  ")).toEqual({ ok: false, error: "name_required" });
    expect(repo.rows[0].name).toBe("旧名");
  });
});

describe("updateTaskEstimate（F-103: 見積もりのインライン編集）", () => {
  it("分の整数を保存する", async () => {
    const repo = inMemoryRepo([task({ id: 1, estimateMinutes: 0 })]);
    expect((await updateTaskEstimate(repo, 1, "45")).ok).toBe(true);
    expect(repo.rows[0].estimateMinutes).toBe(45);
  });

  it("空入力は未設定（0分）へ戻す", async () => {
    const repo = inMemoryRepo([task({ id: 1, estimateMinutes: 30 })]);
    expect((await updateTaskEstimate(repo, 1, "")).ok).toBe(true);
    expect(repo.rows[0].estimateMinutes).toBe(0);
  });

  it("非数値・負値では保存しない（§8: 確定不可）", async () => {
    const repo = inMemoryRepo([task({ id: 1, estimateMinutes: 30 })]);
    expect(await updateTaskEstimate(repo, 1, "-10")).toEqual({
      ok: false,
      error: "invalid_estimate",
    });
    expect(repo.rows[0].estimateMinutes).toBe(30);
  });
});

describe("updateTaskComment（F-206 / O-16: コメントの編集）", () => {
  it("前後の空白を除いて保存する", async () => {
    const repo = inMemoryRepo([task({ id: 1 })]);
    expect((await updateTaskComment(repo, 1, " 元データ探しに手間取った ")).ok).toBe(true);
    expect(repo.rows[0].comment).toBe("元データ探しに手間取った");
  });

  it("空・空白のみで確定するとコメントを消す（NULL へ戻す）", async () => {
    const repo = inMemoryRepo([task({ id: 1, comment: "書いてあった" })]);
    expect((await updateTaskComment(repo, 1, "   ")).ok).toBe(true);
    expect(repo.rows[0].comment).toBeNull();
  });

  it("改行を含む複数行をそのまま保存する", async () => {
    const repo = inMemoryRepo([task({ id: 1 })]);
    await updateTaskComment(repo, 1, "・図表を差し替えた\n・次は雛形を用意する");
    expect(repo.rows[0].comment).toBe("・図表を差し替えた\n・次は雛形を用意する");
  });
});

describe("setTaskHighlight（F-118 / O-17: ハイライトの付け外し）", () => {
  it("ハイライトを付ける", async () => {
    const repo = inMemoryRepo([task({ id: 1, highlighted: false })]);
    expect((await setTaskHighlight(repo, 1, true)).ok).toBe(true);
    expect(repo.rows[0].highlighted).toBe(true);
  });

  it("ハイライトを外す", async () => {
    const repo = inMemoryRepo([task({ id: 1, highlighted: true })]);
    expect((await setTaskHighlight(repo, 1, false)).ok).toBe(true);
    expect(repo.rows[0].highlighted).toBe(false);
  });

  // 状態を問わない（§5.1 F-118）。完了しても外れないのと同じく、完了行にも付けられる
  it("完了したタスクにも付けられる", async () => {
    const completed = task({
      id: 1,
      startedAt: new Date("2026-07-26T09:00:00Z"),
      endedAt: new Date("2026-07-26T09:30:00Z"),
    });
    const repo = inMemoryRepo([completed]);
    expect((await setTaskHighlight(repo, 1, true)).ok).toBe(true);
    expect(repo.rows[0].highlighted).toBe(true);
  });

  // 上限を設けない（§5.1 F-118）。何本目でも同じように付く
  it("本数の上限がなく、複数のタスクに付けられる", async () => {
    const repo = inMemoryRepo([task({ id: 1 }), task({ id: 2 }), task({ id: 3 })]);
    for (const id of [1, 2, 3]) await setTaskHighlight(repo, id, true);
    expect(repo.rows.map((r) => r.highlighted)).toEqual([true, true, true]);
  });

  it("同じ行の他の列には触れない", async () => {
    const original = task({ id: 1, name: "提案書", comment: "メモ", modeId: 3 });
    const repo = inMemoryRepo([original]);
    await setTaskHighlight(repo, 1, true);
    expect(repo.rows[0]).toEqual({ ...original, highlighted: true });
  });
});

describe("setTaskMode / setTaskProject（O-5 / F-401・F-402: 分類の割り当て）", () => {
  it("モードを割り当てる（プロジェクトには触れない）", async () => {
    const repo = inMemoryRepo([task({ id: 1, modeId: null, projectId: 3 })]);
    expect((await setTaskMode(repo, 1, 7)).ok).toBe(true);
    expect(repo.rows[0].modeId).toBe(7);
    expect(repo.rows[0].projectId).toBe(3); // 変わらない
  });

  it("モードを null で未設定へ戻す", async () => {
    const repo = inMemoryRepo([task({ id: 1, modeId: 7 })]);
    expect((await setTaskMode(repo, 1, null)).ok).toBe(true);
    expect(repo.rows[0].modeId).toBeNull();
  });

  it("プロジェクトを割り当てる（モードには触れない）", async () => {
    const repo = inMemoryRepo([task({ id: 1, modeId: 2, projectId: null })]);
    expect((await setTaskProject(repo, 1, 8)).ok).toBe(true);
    expect(repo.rows[0].projectId).toBe(8);
    expect(repo.rows[0].modeId).toBe(2); // 変わらない
  });

  it("プロジェクトを null で未設定へ戻す", async () => {
    const repo = inMemoryRepo([task({ id: 1, projectId: 8 })]);
    expect((await setTaskProject(repo, 1, null)).ok).toBe(true);
    expect(repo.rows[0].projectId).toBeNull();
  });
});

describe("listDailyList の警告対象（画面定義書01 §8: 前日以前の実行中タスク）", () => {
  const deps = (tasks: TaskRepository) => ({
    tasks,
    sections: emptySectionRepo,
    modes: emptyModeRepo,
    projects: emptyProjectRepo,
    bundles: emptyBundleRepo,
  });

  it("実行中タスクが表示日より前ならバナー対象として返す", async () => {
    const repo = inMemoryRepo([
      task({ id: 1, taskDate: "2026-07-25", startedAt: new Date("2026-07-25T23:00:00Z") }),
    ]);
    const view = await listDailyList(deps(repo), TEST_DATE);
    expect(view.staleRunningTask?.id).toBe(1);
  });

  it("実行中タスクが表示日と同じ日なら対象にしない", async () => {
    const repo = inMemoryRepo([
      task({ id: 1, taskDate: TEST_DATE, startedAt: new Date("2026-07-26T09:00:00Z") }),
    ]);
    const view = await listDailyList(deps(repo), TEST_DATE);
    expect(view.staleRunningTask).toBeNull();
  });

  it("未来日を表示中に当日の実行中タスクがあっても対象にする（放置の検知が目的）", async () => {
    const repo = inMemoryRepo([
      task({ id: 1, taskDate: TEST_DATE, startedAt: new Date("2026-07-26T09:00:00Z") }),
    ]);
    const view = await listDailyList(deps(repo), "2026-07-27");
    expect(view.staleRunningTask?.id).toBe(1);
  });

  it("実行中タスクがなければ対象なし", async () => {
    const repo = inMemoryRepo([task({ id: 1, taskDate: "2026-07-25" })]);
    const view = await listDailyList(deps(repo), TEST_DATE);
    expect(view.staleRunningTask).toBeNull();
  });
});

describe("listDailyList の並び順（FB-01 / 画面定義書03 §4: name 昇順・start_time 昇順）", () => {
  it("モードは登録順ではなく name の昇順（自然順）で返す", async () => {
    const modeRepo: ModeRepository = {
      ...emptyModeRepo,
      listAll: async () => [
        { id: 1, name: "ぶどう", color: "#000000", isArchived: false },
        { id: 2, name: "あんず", color: "#000000", isArchived: false },
        { id: 3, name: "いちご", color: "#000000", isArchived: false },
      ],
    };
    const view = await listDailyList(
      {
        tasks: inMemoryRepo(),
        sections: emptySectionRepo,
        modes: modeRepo,
        projects: emptyProjectRepo,
        bundles: emptyBundleRepo,
      },
      TEST_DATE
    );
    expect(view.modes.map((m) => m.name)).toEqual(["あんず", "いちご", "ぶどう"]);
  });

  it("プロジェクトは登録順ではなく name の昇順（自然順）で返す", async () => {
    const projectRepo: ProjectRepository = {
      ...emptyProjectRepo,
      listAll: async () => [
        { id: 1, name: "case-b", isArchived: false },
        { id: 2, name: "case-a", isArchived: false },
      ],
    };
    const view = await listDailyList(
      {
        tasks: inMemoryRepo(),
        sections: emptySectionRepo,
        modes: emptyModeRepo,
        projects: projectRepo,
        bundles: emptyBundleRepo,
      },
      TEST_DATE
    );
    expect(view.projects.map((p) => p.name)).toEqual(["case-a", "case-b"]);
  });

  it("セクションは登録順ではなく start_time の昇順で返す", async () => {
    const sectionRepo: SectionRepository = {
      ...emptySectionRepo,
      listAll: async () => [
        { id: 1, name: "夜", startTime: "20:00", isArchived: false },
        { id: 2, name: "朝", startTime: "06:00", isArchived: false },
        { id: 3, name: "昼", startTime: "12:00", isArchived: false },
      ],
    };
    const view = await listDailyList(
      {
        tasks: inMemoryRepo(),
        sections: sectionRepo,
        modes: emptyModeRepo,
        projects: emptyProjectRepo,
        bundles: emptyBundleRepo,
      },
      TEST_DATE
    );
    expect(view.sections.map((s) => s.name)).toEqual(["朝", "昼", "夜"]);
  });
});

describe("listDailyList のマスタ一覧（F-401 / F-402 / 画面定義書01 §3.3: アーカイブ済みも名前をそのまま表示する）", () => {
  it("プロジェクトはアーカイブ済みも含めて返す（行のプロジェクト列で名前を解決するため）", async () => {
    const projectRepo: ProjectRepository = {
      ...emptyProjectRepo,
      listAll: async () => [
        { id: 1, name: "case-a", isArchived: false },
        { id: 2, name: "case-b", isArchived: true },
      ],
    };
    const view = await listDailyList(
      {
        tasks: inMemoryRepo(),
        sections: emptySectionRepo,
        modes: emptyModeRepo,
        projects: projectRepo,
        bundles: emptyBundleRepo,
      },
      TEST_DATE
    );
    expect(view.projects.map((p) => p.name)).toEqual(["case-a", "case-b"]);
  });

  it("モードはアーカイブ済みも含めて返す（行のモード列とモード色を解決するため）", async () => {
    const modeRepo: ModeRepository = {
      ...emptyModeRepo,
      listAll: async () => [
        { id: 1, name: "あんず", color: "#000000", isArchived: false },
        { id: 2, name: "いちご", color: "#000000", isArchived: true },
      ],
    };
    const view = await listDailyList(
      {
        tasks: inMemoryRepo(),
        sections: emptySectionRepo,
        modes: modeRepo,
        projects: emptyProjectRepo,
        bundles: emptyBundleRepo,
      },
      TEST_DATE
    );
    expect(view.modes.map((m) => m.name)).toEqual(["あんず", "いちご"]);
  });

  // バンドルの道（F-119 / 画面定義書01 §3.3）はアーカイブ済みバンドルに属する展開済みタスクにも
  // 描き続ける（画面定義書05 O-3）ので、モード・プロジェクトと同じく無条件（listAll）で返す
  it("バンドルはアーカイブ済みも含めて返す（アーカイブ後も展開済みタスクの道を描き続けるため）", async () => {
    const bundleRepo = createInMemoryBundleRepository([
      { id: 1, name: "朝の立上げ", color: "#000000", isArchived: false },
      { id: 2, name: "夜のクローズ", color: "#000000", isArchived: true },
    ]);
    const view = await listDailyList(
      {
        tasks: inMemoryRepo(),
        sections: emptySectionRepo,
        modes: emptyModeRepo,
        projects: emptyProjectRepo,
        bundles: bundleRepo,
      },
      TEST_DATE
    );
    expect(view.bundles.map((b) => b.name)).toEqual(["朝の立上げ", "夜のクローズ"]);
  });
});

// 他の画面・端末で削除されたタスクを編集した場合。5つの内訳は画面定義書01 §8 の行が定める
describe("存在しないタスクの編集（00_共通 §4.1 / 画面定義書01 §8: 1行も当たらない更新を成功として返さない）", () => {
  /** 唯一の行（id: 1）とは別の id。削除済みのタスクを触った状況を表す */
  const MISSING = 2;
  const notFound = { ok: false, error: "task_not_found" };

  it("renameTask は失敗を返し、残っている行を書き換えない", async () => {
    const survivor = task({ id: 1, name: "残る" });
    const repo = inMemoryRepo([survivor]);
    expect(await renameTask(repo, MISSING, "新名")).toEqual(notFound);
    expect(repo.rows).toEqual([survivor]);
  });

  it("updateTaskEstimate は失敗を返し、残っている行を書き換えない", async () => {
    const survivor = task({ id: 1, estimateMinutes: 30 });
    const repo = inMemoryRepo([survivor]);
    expect(await updateTaskEstimate(repo, MISSING, "45")).toEqual(notFound);
    expect(repo.rows).toEqual([survivor]);
  });

  it("updateTaskComment は失敗を返し、残っている行を書き換えない", async () => {
    const survivor = task({ id: 1, comment: "元のまま" });
    const repo = inMemoryRepo([survivor]);
    expect(await updateTaskComment(repo, MISSING, "書き換え")).toEqual(notFound);
    expect(repo.rows).toEqual([survivor]);
  });

  it("setTaskHighlight は失敗を返し、残っている行を書き換えない", async () => {
    const survivor = task({ id: 1, highlighted: false });
    const repo = inMemoryRepo([survivor]);
    expect(await setTaskHighlight(repo, MISSING, true)).toEqual(notFound);
    expect(repo.rows).toEqual([survivor]);
  });

  it("setTaskMode は失敗を返し、残っている行を書き換えない", async () => {
    const survivor = task({ id: 1, modeId: 3 });
    const repo = inMemoryRepo([survivor]);
    expect(await setTaskMode(repo, MISSING, 7)).toEqual(notFound);
    expect(repo.rows).toEqual([survivor]);
  });

  it("setTaskProject は失敗を返し、残っている行を書き換えない", async () => {
    const survivor = task({ id: 1, projectId: 3 });
    const repo = inMemoryRepo([survivor]);
    expect(await setTaskProject(repo, MISSING, 8)).toEqual(notFound);
    expect(repo.rows).toEqual([survivor]);
  });

  // 入力検証を持つのは名前と見積もりだけ（コメント・モード・プロジェクトは検証がないので対象外）
  it("入力が無効なら検証エラーを優先して返す", async () => {
    const survivor = task({ id: 1 });
    const repo = inMemoryRepo([survivor]);
    expect(await renameTask(repo, MISSING, "  ")).toEqual({ ok: false, error: "name_required" });
    expect(await updateTaskEstimate(repo, MISSING, "-1")).toEqual({
      ok: false,
      error: "invalid_estimate",
    });
    expect(repo.rows).toEqual([survivor]);
  });
});
