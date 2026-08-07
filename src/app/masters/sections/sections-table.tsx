"use client";

import { useState } from "react";
import { useServerAction } from "@/app/_lib/use-server-action";
import { formatDuration } from "@/app/_lib/format";
import { linkMuted } from "@/app/_lib/ui";
import { sectionCapacityMinutes, type Section, type SectionId } from "@/domain/section/section";
import { TableFrame } from "@/app/_components/table-frame";
import { ArchivedMasterSection } from "../_components/archived-master-section";
import { MasterEditableCell } from "../_components/master-editable-cell";
import { MasterNewRow, MasterNewRowInput } from "../_components/master-new-row";
import {
  archiveSectionAction,
  createSectionAction,
  deleteSectionAction,
  restoreSectionAction,
  setDayStartSectionAction,
  updateSectionAction,
} from "./actions";

type SectionRow = Section & { endTime: string };

type Props = Readonly<{
  ranges: readonly SectionRow[];
  archived: readonly Section[];
  deletableIds: readonly SectionId[];
}>;

// セルごとに独立して編集できる（名前・開始時刻のどちらか一方だけが入力欄になる）
type Editing =
  | Readonly<{ id: SectionId; field: "name" | "startTime" }>
  | Readonly<{ id: "new" }>;

/** 終了時刻は次セクションの開始からの導出（入力しない）ことを示す添え書き（§3.1） */
const derivedEndTime = (endTime: string) => (
  <span
    className="font-mono tabular-nums text-ink-faint"
    title="次のセクションの開始時刻から自動導出"
  >
    –{endTime}
  </span>
);

export function SectionsTable({ ranges, archived, deletableIds }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const { error, setError, isPending, run } = useServerAction();

  /** 更新は行の全項目をまとめて送る（§4）。編集していないもう片方は現在値をそのまま送る */
  function update(id: SectionId, payload: Readonly<{ name: string; startTime: string }>) {
    // 失敗時は編集状態のまま残し、入力し直せるようにする
    run(() => updateSectionAction(id, payload), () => setEditing(null));
  }

  /** 名前セル。クリックでその場編集（§4「編集方式」） */
  const nameCell = (row: SectionRow) => (
    <MasterEditableCell
      isEditing={editing?.id === row.id && editing.field === "name"}
      value={row.name}
      isPending={isPending}
      onStartEditing={() => {
        setError(null);
        setEditing({ id: row.id, field: "name" });
      }}
      onCommit={(name) => update(row.id, { name, startTime: row.startTime })}
      onClose={() => setEditing(null)}
    />
  );

  /** 開始時刻セル。編集できるのは開始時刻のみで、終了時刻は次セクションの開始からの導出値（読み取り専用） */
  const startTimeCell = (row: SectionRow) => (
    <MasterEditableCell
      isEditing={editing?.id === row.id && editing.field === "startTime"}
      value={row.startTime}
      isPending={isPending}
      type="time"
      display={`${row.startTime}–${row.endTime}`}
      adornment={derivedEndTime(row.endTime)}
      onStartEditing={() => {
        setError(null);
        setEditing({ id: row.id, field: "startTime" });
      }}
      onCommit={(startTime) => update(row.id, { name: row.name, startTime })}
      onClose={() => setEditing(null)}
    />
  );

  const newRow = (
    <MasterNewRow
      isPending={isPending}
      onSave={(fieldValue) =>
        run(
          () =>
            createSectionAction({ name: fieldValue("name"), startTime: fieldValue("startTime") }),
          () => setEditing(null)
        )
      }
      onCancel={() => setEditing(null)}
      renderCells={(onKeyDown) => (
        <>
          {/* 日界の選択は保存後に行う（新規行では空） */}
          <td className="py-1" />
          <td className="py-1 pr-2">
            <MasterNewRowInput
              field="name"
              placeholder="セクション名"
              autoFocus
              onKeyDown={onKeyDown}
            />
          </td>
          <td className="py-1 pr-2">
            <span className="flex items-center gap-1">
              <MasterNewRowInput field="startTime" type="time" onKeyDown={onKeyDown} />
              {derivedEndTime("自動")}
            </span>
          </td>
          {/* 長さは枠が定まってから決まる（保存後に出る） */}
          <td className="py-1" />
        </>
      )}
    />
  );

  return (
    <TableFrame
      description={
        // 2行に折って書いた形のまま渡す（1つの文字列にすると行の継ぎ目の空白が消えて表示が変わる）
        <>
          編集できるのは開始時刻だけです（終了時刻は次のセクションの開始から自動導出）。並び順は開始時刻順です。
          先頭のラジオで「1日の開始（日界）」になるセクションを選べます（F-116）。
        </>
      }
      error={error}
      isPending={isPending}
      onAddNew={() => {
        setError(null);
        setEditing({ id: "new" });
      }}
    >
      <table className="mt-2 w-full">
        <thead>
          <tr className="border-b border-line-strong text-left text-sm text-ink-muted">
            <th className="w-16 py-2 font-normal">日界</th>
            <th className="py-2 font-normal">名前</th>
            <th className="w-40 py-2 font-normal">時間帯</th>
            <th className="w-20 py-2 font-normal">長さ</th>
            <th className="w-32 py-2" />
          </tr>
        </thead>
        <tbody>
          {ranges.map((row) => (
            <tr key={row.id} className="border-b border-line">
              <td className="py-2">
                {/* 1日の開始（日界）セクションの選択（F-116 / 画面定義書03 §3.1） */}
                <input
                  type="radio"
                  name="dayStart"
                  aria-label={`${row.name}を1日の開始にする`}
                  checked={row.isDayStart ?? false}
                  disabled={isPending}
                  onChange={() => run(() => setDayStartSectionAction(row.id))}
                />
              </td>
              <td className="py-2">{nameCell(row)}</td>
              <td className="py-2">{startTimeCell(row)}</td>
              <td className="py-2 font-mono tabular-nums text-ink-muted">
                {formatDuration(sectionCapacityMinutes(row.startTime, row.endTime))}
              </td>
              <td className="py-2 text-right whitespace-nowrap">
                <button
                  onClick={() => run(() => archiveSectionAction(row.id))}
                  // 日界セクションはアーカイブ不可（先に別セクションを日界に指定する。§3.1）
                  disabled={isPending || (row.isDayStart ?? false)}
                  title={row.isDayStart ? "日界セクションはアーカイブできません" : undefined}
                  className={`px-2 ${linkMuted} disabled:opacity-40`}
                >
                  アーカイブ
                </button>
              </td>
            </tr>
          ))}
          {editing?.id === "new" && newRow}
        </tbody>
      </table>

      <ArchivedMasterSection
        archived={archived}
        deletableIds={deletableIds}
        isPending={isPending}
        renderCells={(row) => (
          <>
            <td className="py-2">{row.name}</td>
            <td className="w-40 py-2 font-mono tabular-nums">{row.startTime}</td>
          </>
        )}
        onRestore={(id) => run(() => restoreSectionAction(id))}
        onDelete={(id) => run(() => deleteSectionAction(id))}
      />
    </TableFrame>
  );
}
