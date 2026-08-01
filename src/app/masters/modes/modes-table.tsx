"use client";

import { useRef, useState } from "react";
import { useDismiss } from "@/app/_lib/use-dismiss";
import { useServerAction } from "@/app/_lib/use-server-action";
import { floatPanel, linkMuted } from "@/app/_lib/ui";
import { MODE_COLOR_PRESETS, modeColorName, type Mode } from "@/domain/mode/mode";
import { ArchivedMasterSection } from "../_components/archived-master-section";
import { MasterEditableCell } from "../_components/master-editable-cell";
import { MasterNewRow, MasterNewRowInput } from "../_components/master-new-row";
import { MasterTableFrame } from "../_components/master-table-frame";
import {
  createModeAction,
  deleteModeAction,
  setModeArchivedAction,
  updateModeAction,
} from "./actions";

type Props = Readonly<{
  active: readonly Mode[];
  archived: readonly Mode[];
  deletableIds: readonly number[];
}>;

/** 新規モードの既定色（プリセットの先頭＝赤。画面定義書03 §3.2） */
const DEFAULT_MODE_COLOR = MODE_COLOR_PRESETS[0].value;

/**
 * カラーバーを押すと開くプリセット13色の選択（画面定義書03 §3.2）。
 * S-01 の SelectPopover（src/app/(daily)/_components/select-popover.tsx）と同じ作り
 * （floatPanel・Esc と外側クリックで閉じる）だが、モード用の型に合わせてこのファイル内に持つ。
 */
function ColorPickerPopover({
  selected,
  onSelect,
  onClose,
}: Readonly<{
  selected: string;
  onSelect: (color: string) => void;
  onClose: () => void;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // 外側クリック＋Esc で閉じる
  useDismiss(ref, onClose);

  return (
    <div ref={ref} className={`absolute z-10 mt-1 flex w-56 flex-wrap gap-1.5 p-2 ${floatPanel}`}>
      {MODE_COLOR_PRESETS.map(({ value, name }) => (
        <span key={value} className="relative">
          <button
            type="button"
            aria-label={`色 ${name}`}
            aria-pressed={selected === value}
            onMouseEnter={() => setHovered(value)}
            onMouseLeave={() => setHovered((c) => (c === value ? null : c))}
            onFocus={() => setHovered(value)}
            onBlur={() => setHovered((c) => (c === value ? null : c))}
            onClick={() => {
              onSelect(value);
              onClose();
            }}
            style={{ backgroundColor: value }}
            className={`block h-6 w-6 rounded-full ${
              selected === value ? "outline-solid outline-2 outline-offset-2 outline-ink" : ""
            }`}
          />
          {/* 色だけでは選びにくいので、乗せた候補の名前を吹き出しで出す（画面定義書03 §3.2） */}
          {hovered === value && (
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 rounded-control bg-ink px-1.5 py-0.5 text-xs whitespace-nowrap text-paper"
            >
              {name}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

export function ModesTable({ active, archived, deletableIds }: Props) {
  // 編集中のセル（`"new"` は新規追加行）。値は入力欄の DOM が持つ
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [newColor, setNewColor] = useState<string>(DEFAULT_MODE_COLOR);
  const [colorPickerId, setColorPickerId] = useState<number | "new" | null>(null);
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
        aria-label={`色を変更（現在: ${modeColorName(mode.color)}）`}
      >
        <span
          style={{ backgroundColor: mode.color }}
          className="inline-block h-3 w-10 shrink-0 rounded-control"
          aria-hidden
        />
      </button>
      <span className="text-xs text-ink-muted">{modeColorName(mode.color)}</span>
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
        aria-label={`色を選択（現在: ${modeColorName(newColor)}）`}
      >
        <span
          style={{ backgroundColor: newColor }}
          className="inline-block h-3 w-10 shrink-0 rounded-control"
          aria-hidden
        />
      </button>
      <span className="text-xs text-ink-muted">{modeColorName(newColor)}</span>
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
    <MasterTableFrame
      description="色はプリセットから選択します。並び順は名前順です。"
      error={error}
      isPending={isPending}
      onAddNew={() => {
        setError(null);
        setNewColor(DEFAULT_MODE_COLOR);
        setEditingId("new");
      }}
    >
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b border-line-strong text-left text-xs text-ink-muted">
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
                <span className="text-xs">{modeColorName(mode.color)}</span>
              </span>
            </td>
            <td className="py-2">{mode.name}</td>
          </>
        )}
        onRestore={(id) => run(() => setModeArchivedAction(id, false))}
        onDelete={(id) => run(() => deleteModeAction(id))}
      />
    </MasterTableFrame>
  );
}
