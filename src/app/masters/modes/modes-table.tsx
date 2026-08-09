"use client";

import { useState } from "react";
import { useServerAction } from "@/app/_lib/use-server-action";
import { linkMuted, tableHeadRow } from "@/app/_lib/ui";
import type { Mode, ModeId } from "@/domain/mode/mode";
import { colorPresetName } from "@/domain/shared/color-presets";
import { TableFrame } from "@/app/_components/table-frame";
import { ColorPickerPopover, DEFAULT_COLOR } from "@/app/_components/color-picker";
import { ArchivedMasterSection } from "@/app/_components/archived-master-section";
import { MasterEditableCell } from "@/app/_components/master-editable-cell";
import { MasterNewRow, MasterNewRowInput } from "@/app/_components/master-new-row";
import {
  createModeAction,
  deleteModeAction,
  setModeArchivedAction,
  updateModeAction,
} from "./actions";

type Props = Readonly<{
  active: readonly Mode[];
  archived: readonly Mode[];
  deletableIds: readonly ModeId[];
}>;

export function ModesTable({ active, archived, deletableIds }: Props) {
  // 編集中のセル（`"new"` は新規追加行）。値は入力欄の DOM が持つ
  const [editingId, setEditingId] = useState<ModeId | "new" | null>(null);
  const [newColor, setNewColor] = useState<string>(DEFAULT_COLOR);
  const [colorPickerId, setColorPickerId] = useState<ModeId | "new" | null>(null);
  const { error, setError, isPending, run } = useServerAction();

  /** 新規追加行を閉じる（開いていたプリセット選択も畳む） */
  function closeNewRow() {
    setEditingId(null);
    setColorPickerId(null);
  }

  /**
   * 名前セル。クリックでその場編集（§4「編集方式」）。
   * 名前を保存するときは色は現在値のまま送る（色の変更はカラーバーのポップオーバーで独立して行う）
   */
  const nameCell = (mode: Mode) => (
    <MasterEditableCell
      isEditing={editingId === mode.id}
      value={mode.name}
      isPending={isPending}
      onStartEditing={() => {
        setError(null);
        setEditingId(mode.id);
      }}
      // 失敗時は編集状態のまま残し、入力し直せるようにする
      onCommit={(name) =>
        run(() => updateModeAction(mode.id, { name, color: mode.color }), () => setEditingId(null))
      }
      onClose={() => setEditingId(null)}
    />
  );

  /** 色セル。カラーバーを押すとプリセット選択がその場に開き、選んだ色を即保存する */
  const colorCell = (mode: Mode) => (
    <span className="relative inline-flex items-center gap-2">
      <button
        type="button"
        // 名前の保存中は色を変えられないようにする（画面定義書00_共通 §2.3「保存中に始める操作」）
        disabled={isPending}
        onClick={() => setColorPickerId(mode.id)}
        aria-label={`色を変更（現在: ${colorPresetName(mode.color)}）`}
      >
        <span
          style={{ backgroundColor: mode.color }}
          className="inline-block h-3 w-10 shrink-0 rounded-control"
          aria-hidden
        />
      </button>
      <span className="text-sm text-ink-muted">{colorPresetName(mode.color)}</span>
      {colorPickerId === mode.id && (
        <ColorPickerPopover
          selected={mode.color}
          onSelect={(color) =>
            run(
              () => updateModeAction(mode.id, { name: mode.name, color }),
              () => setColorPickerId(null)
            )
          }
          onClose={() => setColorPickerId(null)}
        />
      )}
    </span>
  );

  /** 新規追加行の色セル。選択はまだ送信せずローカルに保持し、保存ボタンでまとめて送る */
  const newColorCell = (
    <span className="relative inline-flex items-center gap-2">
      <button
        type="button"
        // 送信せず表示だけを変える選択も保存中は止める（送る値と表示が食い違う。00_共通 §2.3）
        disabled={isPending}
        onClick={() => setColorPickerId("new")}
        aria-label={`色を選択（現在: ${colorPresetName(newColor)}）`}
      >
        <span
          style={{ backgroundColor: newColor }}
          className="inline-block h-3 w-10 shrink-0 rounded-control"
          aria-hidden
        />
      </button>
      <span className="text-sm text-ink-muted">{colorPresetName(newColor)}</span>
      {colorPickerId === "new" && (
        <ColorPickerPopover
          selected={newColor}
          onSelect={setNewColor}
          onClose={() => setColorPickerId(null)}
        />
      )}
    </span>
  );

  const newRow = (
    <MasterNewRow
      isPending={isPending}
      onSave={(fieldValue) =>
        run(() => createModeAction({ name: fieldValue("name"), color: newColor }), closeNewRow)
      }
      onCancel={closeNewRow}
      renderCells={(onKeyDown) => (
        <>
          <td className="py-1 pr-2">{newColorCell}</td>
          <td className="py-1 pr-2">
            <MasterNewRowInput
              field="name"
              placeholder="モード名"
              autoFocus
              onKeyDown={onKeyDown}
            />
          </td>
        </>
      )}
    />
  );

  return (
    <TableFrame
      description="色はプリセットから選択します。並び順は名前順です。"
      error={error}
      isPending={isPending}
      onAddNew={() => {
        setError(null);
        setNewColor(DEFAULT_COLOR);
        setEditingId("new");
      }}
    >
      <table className="mt-2 w-full">
        <thead>
          <tr className={tableHeadRow}>
            <th className="w-48 py-2 font-normal">色</th>
            <th className="py-2 font-normal">名前</th>
            <th className="w-32 py-2" />
          </tr>
        </thead>
        <tbody>
          {active.map((mode) => (
            <tr key={mode.id} className="border-b border-line">
              <td className="py-2">{colorCell(mode)}</td>
              <td className="py-2">{nameCell(mode)}</td>
              <td className="py-2 text-right whitespace-nowrap">
                <button
                  onClick={() => run(() => setModeArchivedAction(mode.id, true))}
                  disabled={isPending}
                  className={`px-2 ${linkMuted}`}
                >
                  アーカイブ
                </button>
              </td>
            </tr>
          ))}
          {editingId === "new" && newRow}
        </tbody>
      </table>

      <ArchivedMasterSection
        archived={archived}
        deletableIds={deletableIds}
        isPending={isPending}
        renderCells={(mode) => (
          <>
            <td className="w-48 py-2">
              <span className="inline-flex items-center gap-2">
                <span
                  style={{ backgroundColor: mode.color }}
                  className="inline-block h-3 w-10 shrink-0 rounded-control opacity-50"
                  aria-hidden
                />
                <span className="text-sm">{colorPresetName(mode.color)}</span>
              </span>
            </td>
            <td className="py-2">{mode.name}</td>
          </>
        )}
        onRestore={(id) => run(() => setModeArchivedAction(id, false))}
        onDelete={(id) => run(() => deleteModeAction(id))}
      />
    </TableFrame>
  );
}
