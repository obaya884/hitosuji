"use client";

// マスタ管理3表に共通の新規追加行（画面定義書03 §4）。
// 既存行の編集はセルのインライン編集だが、新規行だけは明示的な保存・取消を置く。
// 入力欄の並びは表ごとに違うので `renderCells` で受け取り、値は `data-field` から読む（T-44）。
import type { KeyboardEventHandler, ReactNode } from "react";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { inputBase, linkAccent, linkMuted } from "@/app/_lib/ui";

type Props = Readonly<{
  /** 保存中（Server Action の応答待ち） */
  isPending: boolean;
  /**
   * 保存。`fieldValue("name")` のように `data-field` の名前で入力値を読む
   * （未入力・欄が無い場合は空文字。値の検証はサーバ側が持つ）
   */
  onSave: (fieldValue: (field: string) => string) => void;
  onCancel: () => void;
  /** 値の入力セル（`<td>` 群）。入力欄は `MasterNewRowInput` に `onKeyDown` を渡して作る */
  renderCells: (onKeyDown: KeyboardEventHandler<HTMLInputElement>) => ReactNode;
}>;

export function MasterNewRow({ isPending, onSave, onCancel, renderCells }: Props) {
  /** 行の入力欄から値を読んで保存する。行は押された要素から辿る（ref を持たずに済む） */
  function save(row: HTMLTableRowElement | null) {
    if (row === null) return;
    onSave(
      (field) => row.querySelector<HTMLInputElement>(`input[data-field="${field}"]`)?.value ?? ""
    );
  }

  // 新規行は保存経路が blur ではないので、Enter で直接保存する（IME 判定は共通関数に任せる）
  const onKeyDown = inlineEditKeyHandler({
    onEnter: (input) => save(input.closest("tr")),
    onEscape: () => onCancel(),
  });

  return (
    <tr className="border-b border-line">
      {renderCells(onKeyDown)}
      <td className="py-1 text-right whitespace-nowrap">
        <button
          onMouseDown={(e) => e.preventDefault()} // blur より先に押下を拾う
          onClick={(e) => save(e.currentTarget.closest("tr"))}
          disabled={isPending}
          className={`px-2 ${linkAccent}`}
        >
          保存
        </button>
        <button onClick={onCancel} className={`px-2 ${linkMuted}`}>
          取消
        </button>
      </td>
    </tr>
  );
}

/** 新規追加行の入力欄。保存時に読む名前（`data-field`）を必ず持たせるため部品にしている */
export function MasterNewRowInput({
  field,
  placeholder,
  type = "text",
  autoFocus = false,
  onKeyDown,
}: Readonly<{
  /** `MasterNewRow` の `onSave` が値を読むときの名前 */
  field: string;
  placeholder?: string;
  type?: "text" | "time";
  autoFocus?: boolean;
  onKeyDown: KeyboardEventHandler<HTMLInputElement>;
}>) {
  return (
    <input
      autoFocus={autoFocus}
      type={type}
      defaultValue=""
      placeholder={placeholder}
      data-field={field}
      onKeyDown={onKeyDown}
      // 幅の考え方は MasterEditableCell と同じ（時刻は内容幅）
      className={type === "time" ? inputBase : `w-full ${inputBase}`}
    />
  );
}
