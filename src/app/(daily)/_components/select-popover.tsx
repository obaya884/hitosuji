"use client";

import { Fragment, useEffect, useState } from "react";
import { CheckIcon } from "@/app/_components/icons";
import { floatPanel } from "@/app/_lib/ui";
import { useDismiss } from "@/app/_lib/use-dismiss";
import { useFlipUp } from "@/app/_lib/use-flip-up";
import { revealedScrollTop } from "../_lib/popover-scroll";

export type PopoverOption = Readonly<{
  id: number | null;
  label: string;
  /** モードのカラーバー表示に使う */
  color?: string;
  /** 名前の右に付記する補助表記（セクションの時間帯 `開始–終了` に使う。FB-46） */
  hint?: string;
  /**
   * 一覧の先頭に固定する特別項目（セクションの「現在のセクションへ」。§4.3 / FB-51）。
   * 直後に区切り線を引いて実候補と分け、現在値のハイライト・チェックの対象からは外す
   * （同じ id が下の実候補にも並ぶため、印は実候補側だけが担う）
   */
  isPinned?: boolean;
}>;

type Props = Readonly<{
  options: readonly PopoverOption[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onClose: () => void;
}>;

/**
 * 行の編集ポップオーバー（画面定義書01 O-5）。
 * モーダルは使わず最小限のUIにする（N-05）。キーボード（J/K で候補移動・Enter で確定・
 * Esc で取消）と外側クリックで操作する（F-112）。開いたときは現在値をハイライトする
 */
export function SelectPopover({ options, selectedId, onSelect, onClose }: Props) {
  // 画面下部の行では上向きに開く（§7「ポップオーバーの表示位置」）
  const { ref, positionClass } = useFlipUp<HTMLDivElement>();
  // 開いたときは現在値をハイライト（見つからなければ先頭）。F-112。
  // 先頭の固定項目（§4.3）は初期ハイライトにしないので、現在値の探索・フォールバックとも対象外にする
  const [activeIndex, setActiveIndex] = useState(() => {
    const current = options.findIndex((o) => !o.isPinned && o.id === selectedId);
    return current >= 0 ? current : Math.max(0, options.findIndex((o) => !o.isPinned));
  });

  // 外側クリックで閉じる（Escape は下のキーナビ effect が IME 判定込みで扱うため escape:false）
  useDismiss(ref, onClose, { escape: false });

  // キーボード操作（F-112）。ポップオーバーはフォーカスを掴まないため document で拾う。
  // 表示中は背後の行操作キーが無効化される（daily-board 側で editing 中は素通し）
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing) return;
      // 修飾キーは使わない（00_共通 §3）。Cmd/Ctrl/Alt 併用はブラウザの既定動作へ委ねる
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "j") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
      } else if (e.key === "k") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        // 確定の Enter を背後（window）の打刻ショートカットへ伝播させない（FB-42）。
        // グローバル側は editing でガードするが、確定に伴う再レンダー／リスナー再登録の
        // タイミングでガードをすり抜けて打刻が発火するため、ここで伝播を断つ
        e.preventDefault();
        e.stopPropagation();
        const option = options[activeIndex];
        if (option !== undefined) {
          onSelect(option.id);
          onClose();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, options, onSelect, onClose]);

  // アクティブな候補をパネルの表示領域内へスクロールする（パネル自身の scrollTop だけを動かす。
  // ドキュメントを動かさない理由と計算は popover-scroll.ts）。
  // 区切り線（§4.3）も子要素として並ぶため、子の順番ではなく候補の index を直に引く
  useEffect(() => {
    const panel = ref.current;
    if (panel === null) return;
    const active = panel.querySelector(`[data-option-index="${activeIndex}"]`);
    if (active === null) return;

    const panelBox = panel.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    panel.scrollTop = revealedScrollTop(
      { top: panelBox.top, bottom: panelBox.bottom, scrollTop: panel.scrollTop },
      { top: activeBox.top, bottom: activeBox.bottom }
    );
  }, [activeIndex, ref]);

  return (
    <div
      ref={ref}
      className={`absolute z-10 max-h-64 w-64 overflow-y-auto py-1 ${positionClass} ${floatPanel}`}
    >
      {options.map((option, index) => {
        const isCurrentValue = !option.isPinned && option.id === selectedId;
        return (
          // 固定項目は実候補と同じ id を持つため、key は id ではなく役割で分ける
          <Fragment key={option.isPinned ? "pinned" : (option.id ?? "none")}>
            <button
              type="button"
              data-option-index={index}
              onClick={() => {
                onSelect(option.id);
                onClose();
              }}
              className={`flex w-full items-center gap-2 px-3 py-1 text-left text-sm hover:bg-accent-weak ${
                index === activeIndex ? "bg-accent-weak" : ""
              } ${isCurrentValue ? "font-medium" : ""}`}
            >
              {option.color !== undefined && (
                <span
                  style={{ backgroundColor: option.color }}
                  className="h-3 w-3 shrink-0 rounded-full"
                  aria-hidden
                />
              )}
              {/* 候補は1行に収め、収まらない名前は末尾を省略する（00_共通 §2.1） */}
              <span className={`min-w-0 truncate ${option.id === null ? "text-ink-faint" : ""}`}>
                {option.label}
              </span>
              {option.hint !== undefined && (
                // 見出し §3.2 と同じ時間帯表記（弱色・等幅）で右寄せに付記する（FB-46）。
                // 付記は詰めずに名前側を省略させるため shrink させない
                <span className="ml-auto shrink-0 font-mono text-xs text-ink-muted tabular-nums">
                  {option.hint}
                </span>
              )}
              {isCurrentValue && (
                // 右寄せの起点は hint があれば hint 側、なければ Check 側が担う
                <CheckIcon
                  className={`h-3 w-3 shrink-0 ${option.hint === undefined ? "ml-auto" : ""}`}
                />
              )}
            </button>
            {/* 固定項目と実セクション候補を分ける区切り線（§4.3） */}
            {option.isPinned && <div className="my-1 border-t border-line" aria-hidden />}
          </Fragment>
        );
      })}
    </div>
  );
}
