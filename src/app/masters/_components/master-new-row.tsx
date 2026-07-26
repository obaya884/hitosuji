"use client";

// マスタ管理3表に共通の新規追加行（画面定義書03 §4）。
// 既存行の編集はセルのインライン編集だが、新規行だけは明示的な保存・取消を置く。
// 入力欄の並びは表ごとに違うので `renderCells` で受け取り、値は `data-field` から読む（T-44）。
import type { KeyboardEventHandler, ReactNode } from "react";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { linkAccent, linkMuted } from "@/app/_lib/ui";
import { masterInputClass, type MasterInputType } from "./master-editable-cell";

/** 新規追加行で入力する項目。書き手と読み手の綴りをコンパイラに突き合わせさせるため型で閉じる */
export type MasterNewRowField = "name" | "startTime";

type Props = Readonly<{
  /** 保存中（Server Action の応答待ち） */
  isPending: boolean;
  /**
   * 保存。`fieldValue("name")` のように項目名で入力値を読む
   * （未入力・欄が無い場合は空文字。値の検証はサーバ側が持つ）
   */
  onSave: (fieldValue: (field: MasterNewRowField) => string) => void;
  onCancel: () => void;
  /** 値の入力セル（`<td>` 群）。入力欄は `MasterNewRowInput` に `onKeyDown` を渡して作る */
  renderCells: (onKeyDown: KeyboardEventHandler<HTMLInputElement>) => ReactNode;
}>;

export function MasterNewRow({ isPending, onSave, onCancel, renderCells }: Props) {
  /**
   * 行の入力欄から値を読んで保存する。行は押された要素から辿る——`<tr>` に ref を張る形は
   * lint（react-hooks/refs）が「レンダー中に ref を読む関数を渡している」として禁じる
   */
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
  field: MasterNewRowField;
  placeholder?: string;
  type?: MasterInputType;
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
      className={masterInputClass(type)}
    />
  );
}
