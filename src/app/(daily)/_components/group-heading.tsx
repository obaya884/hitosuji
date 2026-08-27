import type { RefObject } from "react";
import { sectionCapacityMinutes, type SectionId } from "@/domain/section/section";
import { sectionTotalMinutes, type DailyGroup } from "@/domain/task/daily-list";
import { DurationValue } from "@/app/_components/duration-value";
import { formatDuration, formatSignedDuration } from "@/app/_lib/format";
import { UNCATEGORIZED_LABEL } from "@/app/_lib/unset";
import { TaskProgress } from "./task-progress";

export type GroupHeadingProps = Readonly<{
  group: DailyGroup;
  /**
   * セクションの残り時間（分。F-110 / §3.2）。値と表示条件はリスト側が決めて配る
   * （出所は `sectionSlacks`）。出さないときは null
   */
  remainingMinutes: number | null;
  /** 現在時刻を含むセクションの id（§3.2 / F-121）。未分類・表示日≠今日は null */
  currentSectionId: SectionId | null;
  /** 貼り付く位置（§2）。板と列見出しの高さの合計で、リストが実測して配る */
  top: number;
  /** 見出しの高さを測るための ref（§2）。高さはどれも同じなのでリストが先頭にだけ渡す */
  cellRef?: RefObject<HTMLTableCellElement | null>;
}>;

/** セクション見出し行（画面定義書01 §3.2）。0件のセクションは見出し行だけを置く（FB-26） */
export function GroupHeading({
  group,
  remainingMinutes: remaining,
  currentSectionId,
  top,
  cellRef,
}: GroupHeadingProps) {
  // 分子: 完了は実績・未完了は見積もり（§3.2）
  const total = sectionTotalMinutes(group.tasks);
  // セクション枠の長さ（F-110 の分母）。未分類とアーカイブ済みセクションでは枠が定まらない
  const capacity =
    group.section === null || group.endTime === null
      ? null
      : sectionCapacityMinutes(group.section.startTime, group.endTime);

  // 現在セクションの強調（§3.2 / F-121）: 未分類・アーカイブ済みは currentSectionId と一致しない
  const isCurrentSection = group.section !== null && group.section.id === currentSectionId;

  return (
    <tr>
      {/*
        全要素を左寄せで1行に並べる（§3.2「見出し行のレイアウト」。左右分離をやめる）。
        **地色・罫線は `<tr>` ではなくこのセルに置く**——固定するのはセル側で（`<tr>` には
        `position: sticky` が効かない）、地色が離れると下を流れる行が透ける。

        **地色を不透明から外さないこと**（§2）。sticky の封じ込めは表全体なので、過ぎた
        セクションの見出しもこの位置に residual として残り続ける。見えているのが常に1つなのは
        「不透明」「高さが揃っている」「重なり順が同じで DOM 順に描かれる」の3つが揃っている
        ため——どれかを崩すと積み重なりが露見する（経緯は決定ログ 2026-08-27）
      */}
      <td
        ref={cellRef}
        colSpan={9}
        // 重なり順は板（`z-10`）・行内の浮遊面より下、通常の行より上（§2）
        className={`sticky z-1 border-y border-line-strong py-2 pl-2 ${
          isCurrentSection ? "bg-band-now" : "bg-band"
        }`}
        style={{ top }}
      >
        <span className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-wide">
            {group.section === null ? UNCATEGORIZED_LABEL : group.section.name}
          </span>
          {group.section !== null && (
            <span className="font-mono text-xs text-ink-muted tabular-nums">
              {group.section.startTime}
              {group.endTime !== null && `–${group.endTime}`}
            </span>
          )}
          {/* 0件のグループでは時間帯より右を出さない（§3.2 / FB-25。情報がないのに視線を取るため） */}
          {group.tasks.length > 0 && (
            <>
              {/* タスク進捗: プログレスバー＋実施済み/合計（F-114） */}
              <span className="ml-3 flex items-center gap-2">
                <TaskProgress tasks={group.tasks} />
              </span>
              {/* 時間合計（完了は実績・未完了は見積もり） / セクション枠（F-110。日付・時刻に依らず表示する） */}
              <span className="ml-1 text-xs text-ink-muted tabular-nums">
                合計{" "}
                <span className="font-mono">
                  <DurationValue minutes={total} />
                </span>
                {capacity !== null && <span className="font-mono">/{formatDuration(capacity)}</span>}
              </span>
              {/* 残り時間（F-110 / FB-34）: 溢れていると警告色（FB-31 / FB-32） */}
              {remaining !== null && (
                <span className="text-xs text-ink-muted tabular-nums">
                  残り{" "}
                  <span className={`font-mono ${remaining < 0 ? "text-danger" : ""}`}>
                    {formatSignedDuration(remaining)}
                  </span>
                </span>
              )}
            </>
          )}
        </span>
      </td>
    </tr>
  );
}
