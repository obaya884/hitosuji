"use client";

// マスタ管理3表に共通の外枠（画面定義書03 §3・§4）。説明文と「新規追加」ボタンの見出し行、
// 保存に失敗したときのエラー帯までを持ち、表の中身は `children` に置く（T-79）。
// 列の並びは表ごとに違うので、T-44 で抽出した部品と同じく表側に残す。
import type { ReactNode } from "react";
import { btnSecondary, noticeDanger } from "@/app/_lib/ui";
import { PlusIcon } from "@/app/_components/icons";

type Props = Readonly<{
  /** 見出し行の説明文（編集できる項目・並び順の説明。表ごとに違う） */
  description: ReactNode;
  /** 直近の Server Action の失敗メッセージ。`null` なら帯を出さない */
  error: string | null;
  /** 保存中（Server Action の応答待ち） */
  isPending: boolean;
  /** 「新規追加」押下。新規行を開くのに要る初期化が表ごとに違うので表側に置く */
  onAddNew: () => void;
  /**
   * 表本体（`<table>`）とアーカイブ済み一覧。**枠は余白を与えない**ので、
   * 見出し行との間隔（`mt-2`）は表側の `<table>` に付ける
   */
  children: ReactNode;
}>;

export function MasterTableFrame({ description, error, isPending, onAddNew, children }: Props) {
  return (
    <section className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-muted">{description}</p>
        <button
          onClick={onAddNew}
          // 保存中は新しい編集を始めさせない（開いていたセルが閉じてしまう。00_共通 §2.3）
          disabled={isPending}
          className={`inline-flex shrink-0 items-center gap-1 ${btnSecondary}`}
        >
          <PlusIcon className="h-3 w-3" />
          新規追加
        </button>
      </div>

      {error !== null && <p className={`mt-2 ${noticeDanger}`}>{error}</p>}

      {children}
    </section>
  );
}
