"use client";

// 管理画面（ルーチン管理・マスタ管理）の表に共通の外枠（画面定義書02 §3 / 画面定義書03 §3・§4）。
// 説明文と新規追加ボタンの見出し行、保存に失敗したときのエラー帯までを持ち、
// 見出し行より下は `children` に置く。列の並びは表ごとに違うので表側に残す。
import type { ReactNode } from "react";
import { bottomCenterStack, btnSecondary, noticeDanger } from "@/app/_lib/ui";
import { PlusIcon } from "@/app/_components/icons";
import { PendingIndicator } from "@/app/_components/pending-indicator";
import { useSlowPending } from "@/app/_lib/use-slow-pending";

type Props = Readonly<{
  /** 見出し行の説明文（表ごとに違う。編集できる項目・並び順・展開の条件など） */
  description: ReactNode;
  /** 直近の Server Action の失敗メッセージ。`null` なら帯を出さない */
  error: string | null;
  /** 保存中（Server Action の応答待ち） */
  isPending: boolean;
  /** 新規追加ボタンの文言。マスタ管理は既定、ルーチン管理は「新規ルーチン」（画面定義書02 §3） */
  addLabel?: string;
  /** 新規追加の押下。新規行・フォームを開くのに要る初期化が表ごとに違うので表側に置く */
  onAddNew: () => void;
  /**
   * 見出し行より下に置くものすべて（表本体・アーカイブ済み一覧・新規/編集フォーム・空の案内）。
   * **枠は余白を与えない**ので、見出し行との間隔は先頭に来る子（表・フォーム）が自分で持つ
   */
  children: ReactNode;
}>;

export function TableFrame({
  description,
  error,
  isPending,
  addLabel = "新規追加",
  onAddNew,
  children,
}: Props) {
  // この画面の更新はすべて「確定を待つ操作」なので、応答待ちがそのまま合図の対象になる
  // （画面定義書02 §1 / 03 §1・00_共通 §4.2）
  const slowPending = useSlowPending(isPending);

  return (
    <section className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-muted">{description}</p>
        <button
          onClick={onAddNew}
          // 保存中は新しい編集を始めさせない（開いていたセル・フォームが閉じてしまう。00_共通 §2.3）
          disabled={isPending}
          className={`inline-flex shrink-0 items-center gap-1 ${btnSecondary}`}
        >
          <PlusIcon className="h-3 w-3" />
          {addLabel}
        </button>
      </div>

      {error !== null && <p className={`mt-2 ${noticeDanger}`}>{error}</p>}

      {children}

      {slowPending && (
        <div className={bottomCenterStack}>
          <PendingIndicator />
        </div>
      )}
    </section>
  );
}
