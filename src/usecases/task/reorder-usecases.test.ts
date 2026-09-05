import { describe, expect, it } from "vitest";
import type { SectionRepository } from "@/usecases/ports/section-repository";
import type { Section } from "@/domain/section/section";
import { TEST_DATE } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import { moveTaskByOneStep, setTaskSection } from "./reorder-usecases";
import { inMemoryTaskRepository } from "./testing/in-memory-repository";

const sections: Section[] = [
  { id: 1, name: "朝", startTime: "06:00", isArchived: false },
  { id: 2, name: "午前", startTime: "09:00", isArchived: false },
];

const sectionRepo: SectionRepository = {
  listAll: async () => sections,
  create: async () => sections[0],
  update: async () => {},
  setArchived: async () => {},
  setDayStart: async () => {},
  referenceCounts: async () => ({}),
  remove: async () => {},
};

describe("moveTaskByOneStep（画面定義書01 §6: Shift+J/K）", () => {
  it("下へ1つ移動する", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1, sortOrder: 1000 }),
      task({ id: 2, sectionId: 1, sortOrder: 2000 }),
      task({ id: 3, sectionId: 1, sortOrder: 3000 }),
    ]);

    // 成功を成功として返すこと自体も主張する——呼び出し元（`(daily)/actions.ts`）はこの `ok` で
    // 取り直しに行くかエラーを出すかを分けており、その分岐を測れる段は他に無い
    expect(
      await moveTaskByOneStep(
        { tasks: repo, sections: sectionRepo },
        { taskId: 1, date: TEST_DATE, step: 1 }
      )
    ).toEqual({ ok: true, value: 1 });
    expect(repo.rows.find((t) => t.id === 1)?.sortOrder).toBe(2500);
  });

  // 振り直しの計算そのものは domain（`reorder.test.ts`）が持つ。ここで見るのは**配線**——
  // 中間値が尽きたときに算出された振り直しをリポジトリへ渡していること（渡し忘れると
  // 移動したタスクだけが動いて周りが元の値のまま残る）
  it("中間値が尽きたときは振り直しもリポジトリへ渡す", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1, sortOrder: 1000 }),
      task({ id: 2, sectionId: 1, sortOrder: 1001 }),
      task({ id: 3, sectionId: 1, sortOrder: 1002 }),
    ]);

    await moveTaskByOneStep(
      { tasks: repo, sections: sectionRepo },
      { taskId: 3, date: TEST_DATE, step: -1 }
    );

    expect(repo.rows.map((t) => [t.id, t.sortOrder])).toEqual([
      [1, 1000],
      [2, 3000],
      [3, 2000],
    ]);
  });

  it("グループ末尾から下へ動かすと次のセクションへ移る", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1, sortOrder: 1000 }),
      task({ id: 2, sectionId: 2, sortOrder: 1000 }),
    ]);

    await moveTaskByOneStep(
      { tasks: repo, sections: sectionRepo },
      { taskId: 1, date: TEST_DATE, step: 1 }
    );
    expect(repo.rows.find((t) => t.id === 1)?.sectionId).toBe(2);
  });

  it("タスクが1件も無い空の有効セクションへ移動できる（サーバ確定）", async () => {
    // 朝(1) にだけタスク。午前(2) は空だが有効なので移動先になる（画面定義書01 §3.2）
    const repo = inMemoryTaskRepository([task({ id: 1, sectionId: 1, sortOrder: 1000 })]);

    await moveTaskByOneStep(
      { tasks: repo, sections: sectionRepo },
      { taskId: 1, date: TEST_DATE, step: 1 }
    );
    expect(repo.rows.find((t) => t.id === 1)?.sectionId).toBe(2);
  });

  it("未分類のタスクを下へ動かすと最初のセクションへ入る", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: null, sortOrder: 1000 }),
      task({ id: 2, sectionId: 1, sortOrder: 1000 }),
    ]);

    await moveTaskByOneStep(
      { tasks: repo, sections: sectionRepo },
      { taskId: 1, date: TEST_DATE, step: 1 }
    );
    expect(repo.rows.find((t) => t.id === 1)?.sectionId).toBe(1);
  });

  it("存在しないタスクはエラー", async () => {
    const repo = inMemoryTaskRepository([]);
    expect(
      await moveTaskByOneStep(
        { tasks: repo, sections: sectionRepo },
        { taskId: 99, date: TEST_DATE, step: 1 }
      )
    ).toEqual({ ok: false, error: "task_not_found" });
  });

  // T-19: 移動先は表示中のセクション順（当日タスク付きアーカイブ済みも含む）。画面定義書01 O-6
  describe("当日タスクが属するアーカイブ済みセクションも移動先に含む（T-19）", () => {
    // アーカイブ済みがリスト末尾に来る配置（20:00）
    const withArchived: SectionRepository = {
      ...sectionRepo,
      listAll: async () => [
        ...sections,
        { id: 3, name: "旧枠", startTime: "20:00", isArchived: true },
      ],
    };

    // アーカイブ済みが有効セクションの「間」に来る配置（中枠 07:30）。跨ぎの鏡像方向を検証する
    // 表示順: [未分類, 朝(06:00,1), 中枠(07:30,3), 午前(09:00,2)]
    const withMidArchived: SectionRepository = {
      ...sectionRepo,
      listAll: async () => [
        ...sections,
        { id: 3, name: "中枠", startTime: "07:30", isArchived: true },
      ],
    };

    it("有効セクション末尾から下へ動かすとアーカイブ済みセクションへ入る", async () => {
      // 午前(2) にいる id:1 の下は、当日タスク(id:2)を持つアーカイブ済み(3, 20:00)
      const repo = inMemoryTaskRepository([
        task({ id: 1, sectionId: 2, sortOrder: 1000 }),
        task({ id: 2, sectionId: 3, sortOrder: 1000 }),
      ]);

      await moveTaskByOneStep(
        { tasks: repo, sections: withArchived },
        { taskId: 1, date: TEST_DATE, step: 1 }
      );
      expect(repo.rows.find((t) => t.id === 1)?.sectionId).toBe(3);
    });

    it("アーカイブ済みセクションのタスクを上へ動かすと隣の有効セクションへ出せる（閉じ込めない）", async () => {
      const repo = inMemoryTaskRepository([
        task({ id: 1, sectionId: 3, sortOrder: 1000 }),
        task({ id: 2, sectionId: 2, sortOrder: 1000 }),
      ]);

      await moveTaskByOneStep(
        { tasks: repo, sections: withArchived },
        { taskId: 1, date: TEST_DATE, step: -1 }
      );
      expect(repo.rows.find((t) => t.id === 1)?.sectionId).toBe(2);
    });

    // 鏡像方向: アーカイブ済みが有効セクションの間（中枠 07:30）にある配置での跨ぎ
    it("有効セクション先頭から上へ動かすと直上のアーカイブ済みセクションへ入る", async () => {
      // 午前(2,09:00) の直上は中枠(3,07:30 archived)。表示のため中枠にも当日タスク(id:2)を置く
      const repo = inMemoryTaskRepository([
        task({ id: 1, sectionId: 2, sortOrder: 1000 }),
        task({ id: 2, sectionId: 3, sortOrder: 1000 }),
      ]);

      await moveTaskByOneStep(
        { tasks: repo, sections: withMidArchived },
        { taskId: 1, date: TEST_DATE, step: -1 }
      );
      expect(repo.rows.find((t) => t.id === 1)?.sectionId).toBe(3);
    });

    it("アーカイブ済みセクション末尾から下へ動かすと直下の有効セクションへ入る", async () => {
      // 中枠(3,07:30 archived) の直下は午前(2,09:00)
      const repo = inMemoryTaskRepository([
        task({ id: 1, sectionId: 3, sortOrder: 1000 }),
        task({ id: 2, sectionId: 2, sortOrder: 1000 }),
      ]);

      await moveTaskByOneStep(
        { tasks: repo, sections: withMidArchived },
        { taskId: 1, date: TEST_DATE, step: 1 }
      );
      expect(repo.rows.find((t) => t.id === 1)?.sectionId).toBe(2);
    });

    it("末尾に来たアーカイブ済みセクションの最下部では下へ動かない（リスト端）", async () => {
      // 移動先がアーカイブ済みを含む正規メンバーになった結果、端は旧枠(3,20:00)の外縁へ移る
      const repo = inMemoryTaskRepository([
        task({ id: 1, sectionId: 3, sortOrder: 1000 }),
        task({ id: 2, sectionId: 1, sortOrder: 1000 }),
      ]);

      await moveTaskByOneStep(
        { tasks: repo, sections: withArchived },
        { taskId: 1, date: TEST_DATE, step: 1 }
      );
      const after = repo.rows.find((t) => t.id === 1);
      expect([after?.sectionId, after?.sortOrder]).toEqual([3, 1000]); // 位置不変
    });
  });
});

describe("setTaskSection（O-5: セクションの割り当て）", () => {
  it("移動先セクションの末尾へ置く（データモデル定義書 §3.5）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: null, sortOrder: 1000 }),
      task({ id: 2, sectionId: 1, sortOrder: 1000 }),
      task({ id: 3, sectionId: 1, sortOrder: 2000 }),
    ]);

    expect(await setTaskSection(repo, { taskId: 1, date: TEST_DATE, sectionId: 1 })).toEqual({
      ok: true,
      value: 1,
    });

    const moved = repo.rows.find((t) => t.id === 1);
    expect([moved?.sectionId, moved?.sortOrder]).toEqual([1, 3000]);
  });

  it("未分類（null）へ戻せる", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1, sortOrder: 1000 }),
      task({ id: 2, sectionId: null, sortOrder: 1000 }),
    ]);

    await setTaskSection(repo, { taskId: 1, date: TEST_DATE, sectionId: null });

    const moved = repo.rows.find((t) => t.id === 1);
    expect([moved?.sectionId, moved?.sortOrder]).toEqual([null, 2000]);
  });

  it("すでに属しているセクションを選び直すと同じセクションの末尾へ移す（画面定義書01 §4.3: 候補によって規則を変えない）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1, sortOrder: 1000 }),
      task({ id: 2, sectionId: 1, sortOrder: 2000 }),
    ]);

    await setTaskSection(repo, { taskId: 1, date: TEST_DATE, sectionId: 1 });

    // 自分ごと数えた件数を渡しても末尾（2000 の次）に収まる
    const moved = repo.rows.find((t) => t.id === 1);
    expect([moved?.sectionId, moved?.sortOrder]).toEqual([1, 3000]);
  });

  // 上の鏡像。移動対象が**すでに移動先の末尾にいる**枝で、採番は「自分を除いた末尾 +1000」に
  // なる（データモデル定義書 §3.5 の「末尾」に自分を数えない）。自分を数えていれば 6000 になる
  it("すでに末尾にいるタスクを選び直しても末尾のまま（採番は自分を除いた末尾 +1000）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1, sortOrder: 1000 }),
      task({ id: 2, sectionId: 1, sortOrder: 5000 }),
    ]);

    await setTaskSection(repo, { taskId: 2, date: TEST_DATE, sectionId: 1 });

    // 値は 5000 → 2000 と下がるが、id:1（1000）の後ろなので並び順は末尾のまま
    const moved = repo.rows.find((t) => t.id === 2);
    expect([moved?.sectionId, moved?.sortOrder]).toEqual([1, 2000]);
  });

  // 採番規則そのものは domain（`reorder.test.ts` / `sort-order.test.ts`）が持つ。ここで見るのは
  // ユースケースの手順——表示日1日分だけをリポジトリから引いて採番の材料にすること
  it("他の日付のタスクは採番に影響しない（sort_order は task_date ごとに独立）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, taskDate: "2026-07-25", sectionId: 1, sortOrder: 5000 }),
      task({ id: 2, taskDate: TEST_DATE, sectionId: 1, sortOrder: 1000 }),
      task({ id: 3, taskDate: TEST_DATE, sectionId: null, sortOrder: 1000 }),
    ]);

    await setTaskSection(repo, { taskId: 3, date: TEST_DATE, sectionId: 1 });

    // 表示日のセクション1は id:2 だけ。前日の 5000 を数えていれば末尾は 6000 になる
    expect(repo.rows.find((t) => t.id === 3)?.sortOrder).toBe(2000);
    expect(repo.rows.find((t) => t.id === 1)?.sortOrder).toBe(5000); // 他日付は不変
  });

  it("存在しないタスクはエラー", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1, sectionId: null, sortOrder: 1000 })]);

    expect(await setTaskSection(repo, { taskId: 99, date: TEST_DATE, sectionId: 1 })).toEqual({
      ok: false,
      error: "task_not_found",
    });
  });

  it("空のセクションへ割り当てられる", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1, sectionId: null, sortOrder: 1000 })]);

    await setTaskSection(repo, { taskId: 1, date: TEST_DATE, sectionId: 2 });

    const moved = repo.rows.find((t) => t.id === 1);
    expect([moved?.sectionId, moved?.sortOrder]).toEqual([2, 1000]);
  });
});
