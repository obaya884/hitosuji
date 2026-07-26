"use client";

// マスタ管理3表に共通のインライン編集セル（画面定義書03 §4「編集方式」/ 00_共通 §2.3）。
// 表ごとに書き分けていた「Enter/Esc の作法・blur 確定・変更なしの判定・保存中の抑止」を
// ここへ寄せる（T-44）。表に残るのは「何を送るか」の配線だけ。
import type { ReactNode } from "react";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { inputBase } from "@/app/_lib/ui";

/** マスタ管理で編集する値の種類。見た目（幅・字面）はここから導く */
export type MasterInputType = "text" | "time";

/** 入力欄の幅。時刻は内容に合わせる（`w-full` にすると桁の右に余白だけが伸びる） */
export function masterInputClass(type: MasterInputType): string {
  return type === "time" ? inputBase : `w-full ${inputBase}`;
}

type Props = Readonly<{
  /** 編集中はこのセルが入力欄になる（どのセルを開いているかは表が持つ） */
  isEditing: boolean;
  /** 保存済みの現在値。入力欄の初期値・Esc の復帰値・変更有無の判定に使う */
  value: string;
  /** 保存中（Server Action の応答待ち） */
  isPending: boolean;
  type?: MasterInputType;
  /** 閉じているときのボタン表示。既定は `value` そのまま（時間帯のように枠で見せる列で渡す） */
  display?: ReactNode;
  /** 入力欄の右に添える読み取り専用の表示（導出値など） */
  adornment?: ReactNode;
  onStartEditing: () => void;
  /** 値が変わったときだけ呼ばれる（送信する） */
  onCommit: (value: string) => void;
  /** 変更なしの確定・Esc の取消で閉じるとき */
  onClose: () => void;
}>;

export function MasterEditableCell({
  isEditing,
  value,
  isPending,
  type = "text",
  display,
  adornment,
  onStartEditing,
  onCommit,
  onClose,
}: Props) {
  if (!isEditing) {
    return (
      <button
        type="button"
        // 保存中は編集を開かせない（古い値での上書きを防ぐ。00_共通 §2.3「保存中」）。
        // isPending は表ごとに1つなので、実際には保存が返るまで表のどのセルも開かない
        disabled={isPending}
        onClick={onStartEditing}
        className={`${
          type === "time" ? "font-mono tabular-nums" : "text-left"
        } hover:underline disabled:no-underline disabled:opacity-60`}
      >
        {display ?? value}
      </button>
    );
  }

  const input = (
    <input
      autoFocus
      type={type}
      defaultValue={value}
      onKeyDown={inlineEditKeyHandler({
        // 保存の経路は blur の1本だけにする（Enter は入力欄を抜けて合流させ、二重送信を避ける）
        onEnter: (input) => input.blur(),
        onEscape: (input) => {
          // 元の値へ戻してから blur すると、下の onBlur が「変更なし」と判断して閉じるだけになる
          input.value = value;
          input.blur();
        },
      })}
      onBlur={(e) => {
        const next = e.currentTarget.value;
        // 変更がなければ何も送信せず閉じる（クリックしただけで UPDATE が飛ばないように）
        if (next === value) onClose();
        else onCommit(next);
      }}
      className={masterInputClass(type)}
    />
  );

  if (adornment === undefined) return input;
  return (
    <span className="flex items-center gap-1">
      {input}
      {adornment}
    </span>
  );
}
