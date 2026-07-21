// ルーチン一覧の並べ替え（画面定義書02 §3.1: FB-10）
import type { Mode } from "../mode/mode";
import type { Project } from "../project/project";
import { compareByName } from "../shared/name-order";
import type { RecurrenceType, Routine } from "./routine";

export type RoutineSortKey = "name" | "mode" | "project" | "recurrence" | "scheduledStartTime";

export type RoutineSortDirection = "asc" | "desc";

/** 並べ替えに必要なマスタ（名前の引き当てに使う。アーカイブ済みも含めて渡される） */
export type RoutineSortMasters = Readonly<{
  modes: readonly Mode[];
  projects: readonly Project[];
}>;

/** 繰り返しの順序（画面定義書02 §3.1: 頻度の高い順） */
const RECURRENCE_ORDER: readonly RecurrenceType[] = ["daily", "weekly", "monthly", "interval"];

function recurrenceRank(type: RecurrenceType): number {
  return RECURRENCE_ORDER.indexOf(type);
}

/** id からマスタ名を引き当てる。null・マスタに見つからない場合は未設定（null）扱い */
function resolveMasterName(
  id: number | null,
  masters: readonly Readonly<{ id: number; name: string }>[]
): string | null {
  if (id === null) return null;
  const found = masters.find((m) => m.id === id);
  return found === undefined ? null : found.name;
}

/** 画面定義書02 §3.1 の規則で並べ替える（引数は破壊しない） */
export function sortRoutines(
  routines: readonly Routine[],
  masters: RoutineSortMasters,
  key: RoutineSortKey,
  direction: RoutineSortDirection
): Routine[] {
  const modeNameOf = (routine: Routine): string | null =>
    resolveMasterName(routine.modeId, masters.modes);
  const projectNameOf = (routine: Routine): string | null =>
    resolveMasterName(routine.projectId, masters.projects);

  const isUnset = (routine: Routine): boolean => {
    switch (key) {
      case "mode":
        return modeNameOf(routine) === null;
      case "project":
        return projectNameOf(routine) === null;
      default:
        return false;
    }
  };

  const comparePrimary = (a: Routine, b: Routine): number => {
    switch (key) {
      case "name":
        return compareByName(a, b);
      case "mode":
        return compareByName({ name: modeNameOf(a) ?? "" }, { name: modeNameOf(b) ?? "" });
      case "project":
        return compareByName({ name: projectNameOf(a) ?? "" }, { name: projectNameOf(b) ?? "" });
      case "recurrence":
        return recurrenceRank(a.recurrenceType) - recurrenceRank(b.recurrenceType);
      case "scheduledStartTime":
        return a.scheduledStartTime.localeCompare(b.scheduledStartTime);
    }
  };

  const compare = (a: Routine, b: Routine): number => {
    // 未設定は昇順・降順のいずれでも末尾（§3.1: 未設定の扱い）
    const aUnset = isUnset(a);
    const bUnset = isUnset(b);
    if (aUnset !== bUnset) return aUnset ? 1 : -1;
    // 未設定同士は主キーが比較できないので、第2キー（名前の自然順）だけで比べる。
    // 末尾に置く規則は保ったまま、並び自体は他の行と同じく降順で反転させる
    const primary = aUnset && bUnset ? compareByName(a, b) : comparePrimary(a, b) || compareByName(a, b);
    return direction === "desc" ? -primary : primary;
  };

  return [...routines].sort(compare);
}
