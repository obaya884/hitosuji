"use client";

// バンドル管理（S-05）のメンバー表（画面定義書05 §3.2・§4 O-5〜O-8）。並び順・候補の絞り込みは
// 業務ルールなので、`routines`（全ルーチン）をそのまま受け取り、選択中バンドルのメンバー・
// 追加候補はここで domain 関数（bundleMembers / bundleCandidates）から導く
// （RoutinesTable が `sortRoutines` を自分で呼ぶのと同じ形）。
// この画面は N-01（楽観的更新）の対象外（§1）。**保存境界（isPending / run）は
// bundles-board.tsx の左ペイン・ヘッダと共有する**——00_共通 §4.2「再発火の抑止」は対象の行が
// 違っても確定を待つ操作をすべて受け付けない、と定めており、S-05 は画面全体がその対象（§1）。
// エラー帯だけは表示先を振り分けたいので `error`/`setError` は bundles-board.tsx が
// 発生源で出し分けた値を props で受け取る（詳細は bundles-board.tsx 側のコメント）
import { useRef, useState } from "react";
import Link from "next/link";
import type { Bundle } from "@/domain/bundle/bundle";
import type { Mode } from "@/domain/mode/mode";
import { describeRecurrence, type Routine, type RoutineId } from "@/domain/routine/routine";
import { bundleCandidates, bundleMembers } from "@/domain/bundle/members";
import { BUNDLE_MEMBER_MESSAGES } from "@/app/_lib/error-messages";
import { normalizeClockInput } from "@/app/_lib/format";
import { linkAccent, linkMuted, noticeDanger, tableHeadRow } from "@/app/_lib/ui";
import { useDismiss } from "@/app/_lib/use-dismiss";
import type { SetActionError, useServerActionRunner } from "@/app/_lib/use-server-action";
import { DurationValue } from "@/app/_components/duration-value";
import { EditableCell } from "@/app/_components/editable-cell";
import { UnsetMark } from "@/app/_components/unset-mark";
import {
  removeRoutineFromBundleAction,
  setRoutineBundleAction,
  setRoutineScheduledStartTimeAction,
} from "./actions";

/** 保存境界の型。bundles-board.tsx が `useServerActionRunner()` から受け取ったものを配ってくる */
type ServerActionBoundary = ReturnType<typeof useServerActionRunner>;

type Props = Readonly<{
  bundle: Bundle;
  /** 全ルーチン。選択中バンドルのメンバー・追加候補はここから domain 関数で導く */
  routines: readonly Routine[];
  /** 表示用マスタ。アーカイブ済みも含む（参照中のモード名を出すため） */
  modes: readonly Mode[];
  /** この表が発生源のときだけ非 null になるよう、呼び出し側（bundles-board.tsx）が振り分ける */
  error: string | null;
  /** 画面の操作によるクリア（null）も、自分の scope のときだけ効くよう呼び出し側が振り分ける */
  setError: SetActionError;
  isPending: ServerActionBoundary["isPending"];
  run: ServerActionBoundary["run"];
}>;

/** メンバー表（画面定義書05 §3.2）。右ペインのヘッダ（bundles-board.tsx）の下に置く */
export function BundleMembersTable({
  bundle,
  routines,
  modes,
  error,
  setError,
  isPending,
  run,
}: Props) {
  const [editingId, setEditingId] = useState<RoutineId | null>(null);
  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

  const members = bundleMembers(routines, bundle.id);
  const candidates = bundleCandidates(routines);
  const modeById = new Map(modes.map((m) => [m.id, m]));

  // 外側クリック・Esc で候補一覧を閉じる（00_共通 §2.1 と同じ作法）
  useDismiss(addRef, () => setIsAddingOpen(false), { enabled: isAddingOpen });

  function toggleAdding() {
    setError(null);
    setIsAddingOpen((open) => !open);
  }

  function addMember(routineId: RoutineId) {
    run(() => setRoutineBundleAction(routineId, bundle.id), () => setIsAddingOpen(false));
  }

  function removeMember(routineId: RoutineId) {
    run(() => removeRoutineFromBundleAction(routineId));
  }

  /**
   * 開始想定時刻の確定（O-7）。区切りなし入力（`0805`）の解釈は UI 層の責務（`normalizeClockInput`）。
   * **解釈できない入力はサーバへ送らず、その場でエラーを出して編集状態を残す**——`normalizeClockInput`
   * が通す値は必ず `HH:MM` でサーバの検証も必ず通るので、解釈できないと分かっている入力を
   * わざわざ往復させる理由が無い（画面定義書05 §6「検証の規則も文言もS-02と同じ」は
   * `normalizeStartTime`/`isValidStartTime` と `ROUTINE_MESSAGES.invalid_start_time` の再利用で
   * 満たしており、手前で弾いても規則は変わらない）。サーバ側の検証は最後の砦として残る
   */
  function commitStartTime(routineId: RoutineId, raw: string) {
    const value = normalizeClockInput(raw);
    if (value === null) {
      setError(BUNDLE_MEMBER_MESSAGES.invalid_start_time);
      return;
    }
    run(() => setRoutineScheduledStartTimeAction(routineId, value), () => setEditingId(null));
  }

  return (
    <div className="mt-3">
      {error !== null && <p className={`mb-2 ${noticeDanger}`}>{error}</p>}

      {members.length === 0 ? (
        <p className="text-sm text-ink-muted">まだルーチンが入っていません</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className={tableHeadRow}>
              <th className="py-2 font-normal">名前</th>
              <th className="w-24 py-2 font-normal">モード</th>
              <th className="w-40 py-2 font-normal">繰り返し</th>
              <th className="w-20 py-2 pr-4 text-right font-normal">見積</th>
              <th className="w-24 py-2 font-normal">開始想定</th>
              <th className="w-16 py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const mode = member.modeId === null ? undefined : modeById.get(member.modeId);

              return (
                <tr
                  key={member.id}
                  // 無効ルーチンはグレーアウト（S-02 §3 と同じ扱い。無効なメンバーは道が欠ける）。
                  // 名前セルもこの色を継承させる必要があるので、名前リンクに固定色クラスを当てない
                  // （linkAccent 等は継承に勝ってしまい、いちばん目立つ列だけ通常色が残る。
                  // routines-table.tsx:198-200 と同じ理由）
                  className={`border-b border-line ${member.isActive ? "" : "text-ink-faint"}`}
                >
                  <td className="py-2">
                    <Link href={`/routines?edit=${member.id}`} className="hover:underline">
                      {member.name}
                    </Link>
                  </td>
                  <td className="py-2 text-sm">{mode?.name ?? <UnsetMark />}</td>
                  <td className="py-2 text-sm">{describeRecurrence(member)}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums">
                    <DurationValue minutes={member.estimateMinutes} />
                  </td>
                  <td className="py-2 tabular-nums">
                    <EditableCell
                      isEditing={editingId === member.id}
                      value={member.scheduledStartTime}
                      isPending={isPending}
                      // 区切りなし入力（0805）を打てる必要があるので type="time" にはしない
                      // （ネイティブの時刻入力は自由なテキスト入力を受け付けない）
                      type="text"
                      display={<span className="font-mono">{member.scheduledStartTime}</span>}
                      onStartEditing={() => {
                        setError(null);
                        setEditingId(member.id);
                      }}
                      onCommit={(raw) => commitStartTime(member.id, raw)}
                      onClose={() => setEditingId(null)}
                    />
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => removeMember(member.id)}
                      disabled={isPending}
                      className={`px-2 ${linkMuted}`}
                    >
                      外す
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div ref={addRef} className="relative mt-2">
        <button
          type="button"
          onClick={toggleAdding}
          disabled={isPending}
          className={`px-2 ${linkAccent}`}
        >
          ＋ ルーチンを追加
        </button>

        {isAddingOpen &&
          (candidates.length === 0 ? (
            <p className="mt-1 text-sm text-ink-muted">追加できるルーチンがありません。</p>
          ) : (
            <ul className="mt-1 divide-y divide-line rounded-control border border-line">
              {candidates.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => addMember(candidate.id)}
                    disabled={isPending}
                    className="flex w-full items-center justify-between gap-3 px-2 py-1 text-left text-sm hover:bg-accent-weak"
                  >
                    <span>{candidate.name}</span>
                    <span className="font-mono text-ink-muted">
                      {candidate.scheduledStartTime}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}
