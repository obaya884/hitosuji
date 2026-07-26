"use client";

import { useRef, useState } from "react";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { useDismiss } from "@/app/_lib/use-dismiss";
import {
  btnSecondary,
  floatPanel,
  inputBase,
  linkAccent,
  linkMuted,
  noticeDanger,
} from "@/app/_lib/ui";
import { PlusIcon } from "@/app/_components/icons";
import { MODE_COLOR_PRESETS, MODE_COLORS, modeColorName, type Mode } from "@/domain/mode/mode";
import { ArchivedMasterSection } from "../_components/archived-master-section";
import { useMasterAction } from "../_lib/use-master-action";
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

type Editing = Readonly<{ id: number | "new"; name: string }>;

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
  const [editing, setEditing] = useState<Editing | null>(null);
  const [newColor, setNewColor] = useState<string>(MODE_COLORS[0]);
  const [colorPickerId, setColorPickerId] = useState<number | "new" | null>(null);
  const { error, setError, isPending, run } = useMasterAction();

  /**
   * 保存の経路は blur の1本だけにする（画面定義書03 §4「編集方式」）。
   * 名前を保存するときは色は現在値のまま送る（色の変更はカラーバーのポップオーバーで独立して行う）
   */
  function commit(input: HTMLInputElement) {
    if (editing === null) return;
    const name = input.value;
    const original = active.find((m) => m.id === editing.id)?.name;

    // 変更がなければ何もせず閉じる（クリックしただけで UPDATE が飛ばないように）
    if (editing.id !== "new" && name === original) {
      setEditing(null);
      return;
    }

    const color =
      editing.id === "new"
        ? newColor
        : active.find((m) => m.id === editing.id)?.color ?? MODE_COLORS[0];
    const action =
      editing.id === "new"
        ? () => createModeAction({ name, color })
        : () => updateModeAction(editing.id as number, { name, color });
    // 失敗時は編集状態のまま残し、入力し直せるようにする
    run(action, () => setEditing(null));
  }

  const onKeyDown = inlineEditKeyHandler({
    onEnter: (input) => input.blur(),
    onEscape: (input) => {
      // 元の値へ戻してから blur すると、commit が「変更なし」と判断して閉じるだけになる
      input.value = active.find((m) => m.id === editing?.id)?.name ?? "";
      input.blur();
    },
  });

  /** 名前セル。クリックでその場編集（§4「編集方式」） */
  const nameCell = (mode: Mode) =>
    editing?.id === mode.id ? (
      <input
        autoFocus
        defaultValue={mode.name}
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
          setEditing({ id: mode.id, name: mode.name });
        }}
        className="text-left hover:underline disabled:no-underline disabled:opacity-60"
      >
        {mode.name}
      </button>
    );

  /** 色セル。カラーバーを押すとプリセット選択がその場に開き、選んだ色を即保存する */
  const colorCell = (mode: Mode) => (
    <span className="relative inline-flex items-center gap-2">
      <button
        type="button"
        // 名前の保存中は色を変えられないようにする（§4「編集方式」）
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
        <ColorPickerPopover selected={newColor} onSelect={setNewColor} onClose={() => setColorPickerId(null)} />
      )}
    </span>
  );

  // 新規行は保存経路が blur ではないので、Enter で直接保存する（IME 判定は共通関数に任せる）
  const onNewKeyDown = inlineEditKeyHandler({
    onEnter: (input) => commit(input),
    onEscape: () => setEditing(null),
  });

  // 新規追加の行だけは明示的な保存・取消を置く（既存行の編集はセルのインライン編集）
  const newRow = (key: string) => (
    <tr key={key} className="border-b border-line">
      <td className="py-1 pr-2">{newColorCell}</td>
      <td className="py-1 pr-2">
        <input
          autoFocus
          defaultValue=""
          onKeyDown={onNewKeyDown}
          className={`w-full ${inputBase}`}
          placeholder="モード名"
        />
      </td>
      <td className="py-1 text-right whitespace-nowrap">
        <button
          onMouseDown={(e) => e.preventDefault()} // blur より先に押下を拾う
          onClick={(e) => {
            const input = e.currentTarget.closest("tr")?.querySelector("input");
            if (input !== null && input !== undefined) commit(input);
          }}
          disabled={isPending}
          className={`px-2 ${linkAccent}`}
        >
          保存
        </button>
        <button
          onClick={() => {
            setEditing(null);
            setColorPickerId(null);
          }}
          className={`px-2 ${linkMuted}`}
        >
          取消
        </button>
      </td>
    </tr>
  );

  return (
    <section className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-muted">色はプリセットから選択します。並び順は名前順です。</p>
        <button
          onClick={() => {
            setError(null);
            setNewColor(MODE_COLORS[0]);
            setEditing({ id: "new", name: "" });
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
          {editing?.id === "new" && newRow("new")}
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
    </section>
  );
}
