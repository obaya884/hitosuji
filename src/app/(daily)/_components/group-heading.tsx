import { sectionTotalMinutes, type DailyGroup } from "@/domain/task/daily-list";
import { sectionCapacityMinutes } from "@/domain/task/projection";
import { formatDuration, formatEstimate } from "@/app/_lib/format";
import { TaskProgress } from "./task-progress";

export type GroupHeadingProps = Readonly<{
  group: DailyGroup;
  /**
   * セクションの残り時間（分。F-110 / §3.2）。セクションをまたいで積み上げるため
   * 1グループでは決まらず、リスト側が全グループぶんまとめて求めて配る。
   * 表示しない（表示日≠今日・枠が終わった・枠が定まらない）ときは null
   */
  remainingMinutes: number | null;
  /** 現在時刻を含むセクションの id（§3.2 / F-121）。未分類・表示日≠今日は null */
  currentSectionId: number | null;
}>;

/** セクション見出し行（画面定義書01 §3.2）。0件のセクションは見出し行だけを置く（FB-26） */
export function GroupHeading({
  group,
  remainingMinutes: remaining,
  currentSectionId,
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
    <tr className={`border-y border-line-strong ${isCurrentSection ? "bg-band-now" : "bg-band"}`}>
      {/* 全要素を左寄せで1行に並べる（§3.2「見出し行のレイアウト」。左右分離をやめる） */}
      <td colSpan={8} className="py-2 pl-2">
        <span className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-wide">
            {group.section === null ? "未分類" : group.section.name}
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
                合計 <span className="font-mono">{formatEstimate(total)}</span>
                {capacity !== null && <span className="font-mono">/{formatDuration(capacity)}</span>}
              </span>
              {/* 残り時間（F-110 / FB-34）: 溢れていると `-`（FB-31）で警告色（FB-32） */}
              {remaining !== null && (
                <span className="text-xs text-ink-muted tabular-nums">
                  残り{" "}
                  <span className={`font-mono ${remaining < 0 ? "text-danger" : ""}`}>
                    {remaining < 0 ? "-" : "+"}
                    {formatDuration(Math.abs(remaining))}
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
