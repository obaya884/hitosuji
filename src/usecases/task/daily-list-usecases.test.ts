import { describe, expect, it } from "vitest";
import { TEST_DATE } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import { inMemoryBundleRepository } from "@/usecases/bundle/testing/in-memory-repository";
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
const emptyBundleRepo = inMemoryBundleRepository();

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

  it("空白のみの名前では作らない（画面定義書01 §8: 何もしない）", async () => {
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

  it("空の名前では改名しない（画面定義書01 §8: 確定不可）", async () => {
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

  it("非数値・負値では保存しない（画面定義書01 §8: 確定不可）", async () => {
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
});

describe("setTaskMode / setTaskProject（O-5 / F-401・F-402: 分類の割り当て）", () => {
  it("モードを割り当てる（プロジェクトには触れない）", async () => {
    const repo = inMemoryRepo([task({ id: 1, modeId: null, projectId: 3 })]);
    expect((await setTaskMode(repo, 1, 7)).ok).toBe(true);
    expect(repo.rows[0].modeId).toBe(7);
    expect(repo.rows[0].projectId).toBe(3); // 変わらない
  });

  it("プロジェクトを割り当てる（モードには触れない）", async () => {
    const repo = inMemoryRepo([task({ id: 1, modeId: 2, projectId: null })]);
    expect((await setTaskProject(repo, 1, 8)).ok).toBe(true);
    expect(repo.rows[0].projectId).toBe(8);
    expect(repo.rows[0].modeId).toBe(2); // 変わらない
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
  // モード・プロジェクトはアーカイブ済みを混ぜて並べる（画面定義書01 §3.3: 行のモード列・
  // プロジェクト列はアーカイブ済みでも名前をそのまま解決する）。有効分だけを引く実装へ
  // 変えると、この2件だけが落ちる
  it("モードは登録順ではなく name の昇順（自然順）で返す（アーカイブ済みも混ぜて並べる）", async () => {
    const modeRepo: ModeRepository = {
      ...emptyModeRepo,
      listAll: async () => [
        { id: 1, name: "ぶどう", color: "#000000", isArchived: false },
        { id: 2, name: "あんず", color: "#000000", isArchived: false },
        { id: 3, name: "いちご", color: "#000000", isArchived: true },
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

  it("プロジェクトは登録順ではなく name の昇順（自然順）で返す（アーカイブ済みも混ぜて並べる）", async () => {
    const projectRepo: ProjectRepository = {
      ...emptyProjectRepo,
      listAll: async () => [
        { id: 1, name: "case-b", isArchived: true },
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

describe("listDailyList のバンドル一覧（F-119 / 画面定義書05 O-3: アーカイブ後も道を描き続ける）", () => {
  // バンドルの道（F-119 / 画面定義書01 §3.3）はアーカイブ済みバンドルに属する展開済みタスクにも
  // 描き続ける（画面定義書05 O-3）ので、モード・プロジェクトと同じく無条件（listAll）で返す
  it("バンドルはアーカイブ済みも含めて返す（アーカイブ後も展開済みタスクの道を描き続けるため）", async () => {
    const bundleRepo = inMemoryBundleRepository([
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

// 他の画面・端末で削除されたタスクを編集した場合。どの編集が対象かは画面定義書01 §8 の行が定める
describe("存在しないタスクの編集（00_共通 §4.1 / 画面定義書01 §8: 1行も当たらない更新を成功として返さない）", () => {
  /** 唯一の行（id: 1）とは別の id。削除済みのタスクを触った状況を表す */
  const MISSING = 2;
  const notFound = { ok: false, error: "task_not_found" };

  /**
   * 存在検査は編集の入口ごとに別の行（`findById(id) === null`）なので**入口ごとに1ケース置く**。
   * **失敗を値として返すこと自体**は `(daily)/actions.int.test.ts` の全アクション網羅表が
   * 実DBで見るので、ここで見るのは返るコードが `task_not_found` であること。
   * 残った行が変わらないことは偽物リポジトリ側の契約で、
   * `testing/in-memory-repository.test.ts` が持つ
   */
  /** 対象を含まないリポジトリ（唯一の行は id: 1） */
  const repoWithoutTarget = () => inMemoryRepo([task({ id: 1 })]);
  it.each([
    ["renameTask", () => renameTask(repoWithoutTarget(), MISSING, "新名")],
    ["updateTaskEstimate", () => updateTaskEstimate(repoWithoutTarget(), MISSING, "45")],
    ["updateTaskComment", () => updateTaskComment(repoWithoutTarget(), MISSING, "書き換え")],
    ["setTaskHighlight", () => setTaskHighlight(repoWithoutTarget(), MISSING, true)],
    ["setTaskMode", () => setTaskMode(repoWithoutTarget(), MISSING, 7)],
    ["setTaskProject", () => setTaskProject(repoWithoutTarget(), MISSING, 8)],
  ])("%s は task_not_found を返す", async (_name, call) => {
    expect(await call()).toEqual(notFound);
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
