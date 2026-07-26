import { APP_TIME_ZONE } from "@/domain/shared/time-zone";
import { sectionTotalMinutes, type DailyGroup } from "@/domain/task/daily-list";
import {
  sectionCapacityMinutes,
  sectionEndAt,
  sectionRemainingMinutes,
} from "@/domain/task/projection";
import { formatDuration, formatEstimate } from "@/app/_lib/format";
import { TaskProgress } from "./task-progress";

export type GroupHeadingProps = Readonly<{
  group: DailyGroup;
  /** 毎分更新される現在時刻（F-205 / F-120 / F-121） */
  now: Date;
  /** 表示日が今日か。セクション残り時間（§3.2）と予想開始時刻（§3.3）は今日のみ表示する */
  isToday: boolean;
  /** 日界（分）。セクション終了時刻を論理日の区切りで測る起点（F-116） */
  dayStartMinutes: number;
  /** 現在時刻を含むセクションの id（§3.2 / F-121）。未分類・表示日≠今日は null */
  currentSectionId: number | null;
}>;

/** セクション見出し行（画面定義書01 §3.2）。0件のセクションは見出し行だけを置く（FB-26） */
export function GroupHeading({
  group,
  now,
  isToday,
  dayStartMinutes,
  currentSectionId,
}: GroupHeadingProps) {
  // 分子: 完了は実績・未完了は見積もり（§3.2）
  const total = sectionTotalMinutes(group.tasks);
  // セクション枠の長さ（F-110 の分母）。未分類とアーカイブ済みセクションでは枠が定まらない
  const capacity =
    group.section === null || group.endTime === null
      ? null
      : sectionCapacityMinutes(group.section.startTime, group.endTime);

  // 残り時間（F-110）: (終了時刻 − 現在時刻) − 未完了見積もり。
  // 現在時刻依存のため、表示日=今日で、かつ now が終了時刻より前のときだけ表示する（§3.2）
  const endAt =
    group.section === null || group.endTime === null
      ? null
      : sectionEndAt(now, group.section.startTime, group.endTime, APP_TIME_ZONE, dayStartMinutes);
  const remaining =
    endAt !== null && isToday && now.getTime() < endAt.getTime()
      ? sectionRemainingMinutes(endAt, group.tasks, now)
      : null;

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
