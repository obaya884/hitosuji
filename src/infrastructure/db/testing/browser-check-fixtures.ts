// ブラウザ実機確認（T-37）用のフィクスチャ投入。`npm run dev:check` から呼ばれる。
//
// **初期データ（seed.ts）とは役目が違う**。あちらは本番の初期投入にも使う
// データモデル定義書 §5 の契約で、こちらは確認観点に従属して変わる開発用データ
// （テスト戦略定義書 §4「テスト補助の置き場」）。混ぜると確認用のダミーが本番へ流れる。
//
// 投入先は確認専用DB（db-test インスタンス内の hitosuji_check）で、実データを持つ
// 開発DB（:5432）とはインスタンスごと別。毎回 TRUNCATE してから入れ直すので、
// 確認は常に同じ状態から始まる。
import { pathToFileURL } from "node:url";
import { routine } from "@/domain/routine/testing/routine";
import { addDays } from "@/domain/shared/logical-date";
import { task } from "@/domain/task/testing/task";
import { todayFromSections } from "@/usecases/section/resolve-today";
import { createSectionRepository } from "../repositories/drizzle-section-repository";
import type { Database } from "../index";
import { modes, projects, routines, tasks } from "../schema";
import { seedMasters } from "../seed";
import { truncateAll } from "./test-db";

// 確認専用DB以外へ投入させないための目印。TRUNCATE を伴うので、間違えた先が
// 実データを持つ開発DBだと取り返しがつかない（`main()` が接続先を照合する）
const CHECK_DB_NAME = "hitosuji_check";

// 幾何・スクロールの確認には「画面下部までスクロールする程度の行数」が要る（FB-51 の
// ポップオーバー反転はまさにそれで再現した）。ここを削ると測れなくなる観点が出る
const FILLER_TASK_COUNT = 24;

/** 確認用フィクスチャの投入結果（`main()` が件数を表示する） */
export type CheckFixtureResult = Readonly<{
  taskDate: string;
  tasks: number;
  routines: number;
  projects: number;
}>;

/**
 * 打刻時刻は**実行時刻からの相対**で決める（固定の壁時計にしない）。
 * 「9:30 開始」のように書くと、深夜に確認したとき開始時刻が未来になり、**そのタスクを
 * 終了できなくなる**（`ended_at >= started_at` の検査制約 `ck_tasks_time` に触れる）。
 * いつ確認しても打刻を試せることを優先する
 */
function minutesBefore(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

/**
 * ドメインのフィクスチャ（`task()` / `routine()`）を投入値へ。
 * **id は serial に任せる**——明示すると sequence が追随せず、確認中に画面から
 * 追加したタスクが既存 id と衝突する
 */
function withoutId<T extends { id: number }>(row: T): Omit<T, "id"> {
  const { id, ...rest } = row;
  void id;
  return rest;
}

export async function loadBrowserCheckFixtures(
  db: Database,
  now: Date
): Promise<CheckFixtureResult> {
  await truncateAll(db);

  // マスタは初期データの正（データモデル定義書 §5）をそのまま使う。セクション5件・モード3件
  await seedMasters(db);
  const sectionList = await createSectionRepository(db).listAll();
  const modeRows = await db.select({ id: modes.id }).from(modes).orderBy(modes.id);

  // **セクションは名前で引く**（並び順で引かない）。同書 §5 の並びは開始時刻順で
  // 深夜 00:00 が先頭に来るため、位置で取ると全部が1つずれる
  const sectionIdOf = (name: string): number => {
    const found = sectionList.find((s) => s.name === name);
    if (found === undefined) throw new Error(`初期データにセクション「${name}」がありません`);
    return found.id;
  };

  // データモデル定義書 §5 は projects を空と定めるので、候補が要る確認（ポップオーバー・キーナビ）のために
  // ここで足す。本番の初期データには入らない
  const projectRows = await db
    .insert(projects)
    .values([{ name: "確認用プロジェクトA" }, { name: "確認用プロジェクトB" }])
    .returning({ id: projects.id });

  // 表示日は画面と同じ導出を使う（日界セクションを変えてもフィクスチャだけずれない）
  const taskDate = todayFromSections(sectionList, now);
  const [work, life, rest] = modeRows.map((m) => m.id);

  // ルーチンは「展開されること」を確認するための最小限。展開はデイリー表示時にサーバが行う
  const routineRows = await db
    .insert(routines)
    .values(
      [
        routine({
          id: 1,
          name: "確認用ルーチン（朝）",
          scheduledStartTime: "07:00",
          modeId: life,
        }),
        routine({
          id: 2,
          name: "確認用ルーチン（午後）",
          scheduledStartTime: "13:00",
          modeId: work,
          estimateMinutes: 45,
        }),
      ].map(withoutId)
    )
    .returning({ id: routines.id });

  // 状態3種（完了・実行中・未実行）を必ず揃える。実行中は全体で最大1件（要件定義書 §5.1）
  const fixed = [
    task({
      id: 1,
      taskDate,
      name: "完了済みのタスク",
      estimateMinutes: 30,
      sectionId: sectionIdOf("朝"),
      modeId: life,
      startedAt: minutesBefore(now, 120),
      endedAt: minutesBefore(now, 87),
      // 実績ログ（画面定義書04 §3.3）に出るのは打刻済みのタスクだけなので、
      // レビュー画面のコメント表示を確かめるにはここにコメントが要る
      comment:
        "確認用のコメント（完了済み）。レビューの実績ログで折り返しを見るために、1行では収まらない長さにしてある。\n2行目は改行のあとに続く。",
    }),
    task({
      id: 2,
      taskDate,
      name: "実行中のタスク",
      estimateMinutes: 60,
      sectionId: sectionIdOf("午前"),
      modeId: work,
      projectId: projectRows[0].id,
      startedAt: minutesBefore(now, 25),
    }),
    task({
      id: 3,
      taskDate,
      name: "見積もり未設定のタスク",
      sectionId: sectionIdOf("午前"),
      modeId: work,
    }),
    task({
      id: 4,
      taskDate,
      name: "モード未設定のタスク",
      estimateMinutes: 15,
      sectionId: sectionIdOf("午後"),
    }),
    task({
      id: 5,
      taskDate,
      name: "コメント付きのタスク",
      estimateMinutes: 25,
      sectionId: sectionIdOf("午後"),
      modeId: rest,
      projectId: projectRows[1].id,
      comment: "確認用のコメント",
    }),
    // 折り返しと行の伸び（F-206 / 画面定義書01 §3.3。長さの制限を設けず改行も含むのは
    // データモデル定義書 §3.5 の comment 列）を測るための長文
    task({
      id: 6,
      taskDate,
      name: "長いコメント付きのタスク",
      estimateMinutes: 40,
      sectionId: sectionIdOf("午後"),
      modeId: work,
      comment:
        "確認用の長いコメント。折り返しの幅と行の伸び方を測るために、1行では収まらない長さにしてある。\n2行目は改行のあとに続く。改行がそのまま保たれ、横スクロールが出ないことを見る。",
    }),
    // ハイライト（F-118 / 画面定義書01 §3.3）。未実行は地色が出て、完了は地色を出さず⭐だけ残る——
    // 2件揃えないと「完了行で地色が消える」を差として測れない
    task({
      id: 7,
      taskDate,
      name: "ハイライトされた未実行タスク",
      estimateMinutes: 90,
      sectionId: sectionIdOf("午後"),
      modeId: work,
      projectId: projectRows[0].id,
      highlighted: true,
    }),
    task({
      id: 8,
      taskDate,
      name: "ハイライトされた完了タスク",
      estimateMinutes: 45,
      sectionId: sectionIdOf("朝"),
      modeId: work,
      startedAt: minutesBefore(now, 200),
      endedAt: minutesBefore(now, 150),
      highlighted: true,
    }),
    // 持ち越し表記（F-122 / 画面定義書01 §3.3）。セクション併記・コメント印・⭐と同じ流し込みに
    // 乗るので、名前が長い行で列幅がどう動くかを測れるように**長い名前**と組み合わせる
    task({
      id: 9,
      taskDate,
      initialTaskDate: addDays(taskDate, -3),
      name: "3日ぶん持ち越している、名前の長い未実行タスク",
      estimateMinutes: 30,
      sectionId: sectionIdOf("午後"),
      modeId: work,
      projectId: projectRows[0].id,
      comment: "持ち越し表記とコメント印・⭐が同じ行に並ぶ場合の見え方を測る。",
      highlighted: true,
    }),
  ];

  // 画面下部まで届かせるための行。末尾のセクション（夜）にも入れて下端の幾何を測れるようにする。
  // 見積もりは 0（＝未設定扱い）を避ける——未設定の見え方は上の専用タスクで測る
  const eveningIds = [sectionIdOf("午後"), sectionIdOf("夜")];
  const fillers = Array.from({ length: FILLER_TASK_COUNT }, (_, i) =>
    task({
      id: fixed.length + i + 1,
      taskDate,
      name: `確認用タスク ${String(i + 1).padStart(2, "0")}`,
      estimateMinutes: 15 + (i % 4) * 15,
      sectionId: eveningIds[i % eveningIds.length],
      modeId: modeRows[i % modeRows.length].id,
    })
  );

  // 当日以外の日。**レビューの先送り内訳（画面定義書04 §3.4）は表示日が過去日のときだけ出る**ので、
  // 当日の行だけでは持ち越し表記（F-122）を出す経路に届かない。日付移動（O-7 / F-123）も
  // 行き先が表示日で決まるので、**過去日と未来日の両方に未実行の行が要る**（今日を見ているだけでは
  // 「今日へ移動」の文言にも引き寄せにも届かない）
  const yesterday = addDays(taskDate, -1);
  const threeDaysAgo = addDays(taskDate, -3);
  const tomorrow = addDays(taskDate, 1);
  // 前日以前の未実行は**2日ぶん**置く——警告バナー（F-124 / 画面定義書01 §8）が日付ごとに分けて
  // 古い日から並べることと、片付けた日から順に消えることを確かめるには、1日では足りない
  const otherDays = [
    task({
      // id は投入時に捨てる（`withoutId`）が、`task()` は sort_order を id から採るので通しで振る
      id: fixed.length + fillers.length + 1,
      taskDate: yesterday,
      initialTaskDate: addDays(yesterday, -2),
      name: "前日に先送りしたまま残っているタスク",
      estimateMinutes: 30,
      sectionId: sectionIdOf("午後"),
      modeId: work,
    }),
    task({
      id: fixed.length + fillers.length + 2,
      taskDate: threeDaysAgo,
      name: "3日前に残ったままのタスク",
      estimateMinutes: 15,
      sectionId: sectionIdOf("午前"),
      modeId: life,
    }),
    task({
      id: fixed.length + fillers.length + 3,
      taskDate: tomorrow,
      name: "翌日に積んであるタスク（今日へ引き寄せる）",
      estimateMinutes: 20,
      sectionId: sectionIdOf("午前"),
      modeId: work,
    }),
  ];

  await db.insert(tasks).values([...fixed, ...fillers, ...otherDays].map(withoutId));

  return {
    taskDate,
    tasks: fixed.length + fillers.length + otherDays.length,
    routines: routineRows.length,
    projects: projectRows.length,
  };
}

async function main() {
  const { config } = await import("dotenv");
  config({ path: [".env.local", ".env"], quiet: true });

  // **接続先を照合してから投入する**。このスクリプトは全テーブルを TRUNCATE するので、
  // `dev:check` を経由せず直接叩かれると `.env.local` の DATABASE_URL＝実データを持つ
  // 開発DBを消しかねない（dotenv はシェルの値を上書きしないので、経由すれば確認用DBが勝つ）
  const url = process.env.DATABASE_URL;
  if (url === undefined || !url.includes(CHECK_DB_NAME)) {
    console.error(
      `確認専用DB（${CHECK_DB_NAME}）以外へは投入しません。npm run dev:check から実行してください`
    );
    process.exit(1);
  }

  const { db } = await import("../index");
  const result = await loadBrowserCheckFixtures(db, new Date());
  console.log(
    `確認用フィクスチャを投入しました（表示日 ${result.taskDate} / タスク ${result.tasks}件 / ルーチン ${result.routines}件 / プロジェクト ${result.projects}件）`
  );
  process.exit(0);
}

// `npm run dev:check` から直接実行されたときだけ走らせる（seed.ts と同じ判定）
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
