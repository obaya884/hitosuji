"use client";

import { useState, useTransition } from "react";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import {
  btnSecondary,
  inputBase,
  linkAccent,
  linkMuted,
  noticeDanger,
} from "@/app/_lib/ui";
import { PlusIcon } from "@/app/_components/icons";
import type { Section } from "@/domain/section/section";
import { DeleteMasterButton } from "../_components/delete-master-button";
import type { ActionResult } from "../_lib/action-result";
import {
  archiveSectionAction,
  createSectionAction,
  deleteSectionAction,
  restoreSectionAction,
  updateSectionAction,
} from "./actions";

type SectionRow = Section & { endTime: string };

type Props = Readonly<{
  ranges: readonly SectionRow[];
  archived: readonly Section[];
  deletableIds: readonly number[];
}>;

// セルごとに独立して編集できる（名前・開始時刻のどちらか一方だけが入力欄になる）
type Editing =
  | Readonly<{ id: number; field: "name" | "startTime" }>
  | Readonly<{ id: "new" }>;

export function SectionsTable({ ranges, archived, deletableIds }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) onSuccess?.();
      else setError(result.message);
    });
  }

  /**
   * 保存の経路は blur の1本だけにする（画面定義書03 §4「編集方式」）。
   * 保存時は編集していないもう片方のフィールドは現在値をそのまま送る。
   */
  function commit(input: HTMLInputElement) {
    if (editing === null || editing.id === "new") return;
    const row = ranges.find((r) => r.id === editing.id);
    if (row === undefined) return;

    const value = input.value;
    const original = editing.field === "name" ? row.name : row.startTime;

    // 変更がなければ何もせず閉じる（クリックしただけで UPDATE が飛ばないように）
    if (value === original) {
      setEditing(null);
      return;
    }

    const payload =
      editing.field === "name"
        ? { name: value, startTime: row.startTime }
        : { name: row.name, startTime: value };
    // 失敗時は編集状態のまま残し、入力し直せるようにする
    run(() => updateSectionAction(editing.id as number, payload), () => setEditing(null));
  }

  const onKeyDown = inlineEditKeyHandler({
    onEnter: (input) => input.blur(),
    onEscape: (input) => {
      // 元の値へ戻してから blur すると、commit が「変更なし」と判断して閉じるだけになる
      if (editing !== null && editing.id !== "new") {
        const row = ranges.find((r) => r.id === editing.id);
        input.value = (editing.field === "name" ? row?.name : row?.startTime) ?? "";
      }
      input.blur();
    },
  });

  /** 名前セル。クリックでその場編集（§4「編集方式」） */
  const nameCell = (row: SectionRow) =>
    editing?.id === row.id && editing.field === "name" ? (
      <input
        autoFocus
        defaultValue={row.name}
        onKeyDown={onKeyDown}
        onBlur={(e) => commit(e.currentTarget)}
        className={`w-full ${inputBase}`}
      />
    ) : (
      <button
        type="button"
        // 保存中は同じ行の他のセルを触らせない（古い値での上書きを防ぐ。§4「編集方式」）
        disabled={isPending}
        onClick={() => {
          setError(null);
          setEditing({ id: row.id, field: "name" });
        }}
        className="text-left hover:underline disabled:no-underline disabled:opacity-60"
      >
        {row.name}
      </button>
    );

  /** 開始時刻セル。編集できるのは開始時刻のみで、終了時刻は次セクションの開始からの導出値（読み取り専用） */
  const startTimeCell = (row: SectionRow) =>
    editing?.id === row.id && editing.field === "startTime" ? (
      <span className="flex items-center gap-1">
        <input
          type="time"
          autoFocus
          defaultValue={row.startTime}
          onKeyDown={onKeyDown}
          onBlur={(e) => commit(e.currentTarget)}
          className={inputBase}
        />
        <span
          className="font-mono tabular-nums text-ink-faint"
          title="次のセクションの開始時刻から自動導出"
        >
          –{row.endTime}
        </span>
      </span>
    ) : (
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          setEditing({ id: row.id, field: "startTime" });
        }}
        className="font-mono tabular-nums hover:underline disabled:no-underline disabled:opacity-60"
      >
        {row.startTime}–{row.endTime}
      </button>
    );

  // 新規追加の行だけは明示的な保存・取消を置く（既存行の編集はセルのインライン編集）
  function saveNew(tr: HTMLTableRowElement | null) {
    if (tr === null) return;
    const name = tr.querySelector<HTMLInputElement>('[data-field="name"]')?.value ?? "";
    const startTime = tr.querySelector<HTMLInputElement>('[data-field="startTime"]')?.value ?? "";
    run(() => createSectionAction({ name, startTime }), () => setEditing(null));
  }

  const onNewKeyDown = inlineEditKeyHandler({
    onEnter: (input) => saveNew(input.closest("tr")),
    onEscape: () => setEditing(null),
  });

  const newRow = (key: string) => (
    <tr key={key} className="border-b border-line">
      <td className="py-1 pr-2">
        <input
          autoFocus
          defaultValue=""
          onKeyDown={onNewKeyDown}
          className={`w-full ${inputBase}`}
          placeholder="セクション名"
          data-field="name"
        />
      </td>
      <td className="py-1 pr-2">
        <span className="flex items-center gap-1">
          <input
            type="time"
            defaultValue=""
            onKeyDown={onNewKeyDown}
            className={inputBase}
            data-field="startTime"
          />
          {/* 終了時刻は次セクションの開始からの導出（入力しない）ことを新規追加時にも示す */}
          <span className="font-mono tabular-nums text-ink-faint" title="次のセクションの開始時刻から自動導出">
            –自動
          </span>
        </span>
      </td>
      <td className="py-1 text-right whitespace-nowrap">
        <button
          onMouseDown={(e) => e.preventDefault()} // blur より先に押下を拾う
          onClick={(e) => saveNew(e.currentTarget.closest("tr"))}
          disabled={isPending}
          className={`px-2 ${linkAccent}`}
        >
          保存
        </button>
        <button onClick={() => setEditing(null)} className={`px-2 ${linkMuted}`}>
          取消
        </button>
      </td>
    </tr>
  );

  return (
    <section className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-muted">
          編集できるのは開始時刻だけです（終了時刻は次のセクションの開始から自動導出）。並び順は開始時刻順です。
        </p>
        <button
          onClick={() => {
            setError(null);
            setEditing({ id: "new" });
          }}
          className={`inline-flex shrink-0 items-center gap-1 ${btnSecondary}`}
        >
          <PlusIcon className="h-3 w-3" />
          新規追加
        </button>
      </div>

      {error !== null && (
        <p className={`mt-2 ${noticeDanger}`}>
          {error}
        </p>
      )}

      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b border-line-strong text-left text-xs text-ink-muted">
            <th className="py-2 font-normal">名前</th>
            <th className="w-40 py-2 font-normal">時間帯</th>
            <th className="w-32 py-2" />
          </tr>
        </thead>
        <tbody>
          {ranges.map((row) => (
            <tr key={row.id} className="border-b border-line">
              <td className="py-2">{nameCell(row)}</td>
              <td className="py-2">{startTimeCell(row)}</td>
              <td className="py-2 text-right whitespace-nowrap">
                <button
                  onClick={() => run(() => archiveSectionAction(row.id))}
                  disabled={isPending}
                  className={`px-2 ${linkMuted}`}
                >
                  アーカイブ
                </button>
              </td>
            </tr>
          ))}
          {editing?.id === "new" && newRow("new")}
        </tbody>
      </table>

      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-ink-muted">
            アーカイブ済み（{archived.length}）
          </summary>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {archived.map((row) => (
                <tr key={row.id} className="border-b border-line text-ink-muted">
                  <td className="py-2">{row.name}</td>
                  <td className="w-40 py-2 font-mono tabular-nums">{row.startTime}</td>
                  <td className="w-32 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => run(() => restoreSectionAction(row.id))}
                      disabled={isPending}
                      className={`px-2 ${linkAccent}`}
                    >
                      復元
                    </button>
                    {deletableIds.includes(row.id) && (
                      <DeleteMasterButton
                        onDelete={() => run(() => deleteSectionAction(row.id))}
                        disabled={isPending}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
