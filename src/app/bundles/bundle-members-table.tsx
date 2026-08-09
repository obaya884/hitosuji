"use client";

// バンドル管理（S-05）のメンバー表（画面定義書05 §3.2・§4 O-5〜O-8）。並び順・候補の絞り込みは
// 業務ルールなので、`routines`（全ルーチン）をそのまま受け取り、選択中バンドルのメンバー・
// 追加候補はここで domain 関数（bundleMembers / bundleCandidates）から導く
// （RoutinesTable が `sortRoutines` を自分で呼ぶのと同じ形）。
// この画面は N-01（楽観的更新）の対象外（§1）で、保存境界（`useServerAction`）は
// bundles-board.tsx のヘッダとは別に持つ
import { useRef, useState } from "react";
import Link from "next/link";
import type { Bundle } from "@/domain/bundle/bundle";
import type { Mode } from "@/domain/mode/mode";
import { describeRecurrence, type Routine, type RoutineId } from "@/domain/routine/routine";
import { bundleCandidates, bundleMembers } from "@/domain/routine/order";
import { normalizeClockInput } from "@/app/_lib/format";
import { bottomCenterStack, linkAccent, linkMuted, noticeDanger, tableHeadRow } from "@/app/_lib/ui";
import { useDismiss } from "@/app/_lib/use-dismiss";
import { useServerAction } from "@/app/_lib/use-server-action";
import { useSlowPending } from "@/app/_lib/use-slow-pending";
import { DurationValue } from "@/app/_components/duration-value";
import { MasterEditableCell } from "@/app/_components/master-editable-cell";
import { PendingIndicator } from "@/app/_components/pending-indicator";
import { UnsetMark } from "@/app/_components/unset-mark";
import {
  removeRoutineFromBundleAction,
  setRoutineBundleAction,
  setRoutineScheduledStartTimeAction,
} from "./actions";

type Props = Readonly<{
  bundle: Bundle;
  /** 全ルーチン。選択中バンドルのメンバー・追加候補はここから domain 関数で導く */
  routines: readonly Routine[];
  /** 表示用マスタ。アーカイブ済みも含む（参照中のモード名を出すため） */
  modes: readonly Mode[];
}>;

/** メンバー表（画面定義書05 §3.2）。右ペインのヘッダ（bundles-board.tsx）の下に置く */
export function BundleMembersTable({ bundle, routines, modes }: Props) {
  const [editingId, setEditingId] = useState<RoutineId | null>(null);
  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const { error, setError, isPending, run } = useServerAction();
  // 確定を待つ操作の進行中の合図（00_共通 §4.2）。ヘッダ側（bundles-board.tsx）は左ペインの
  // TableFrame が自前で出すが、メンバー表は保存境界が別なのでここでも出す
  const slowPending = useSlowPending(isPending);
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
   * **解釈できない入力は空文字で渡し、サーバの `invalid_start_time` を確実に踏ませる**
   * （`routinize-popover.tsx` の submit と同じ手当て。生の文字列をそのまま渡すと、サーバ側の
   * `normalizeStartTime` が先頭5文字を切り出すだけなので `09:05x` のような余剰入力が
   * `09:05` として黙って通ってしまう）
   */
  function commitStartTime(routineId: RoutineId, raw: string) {
    const value = normalizeClockInput(raw) ?? "";
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
                  // 無効ルーチンはグレーアウト（S-02 §3 と同じ扱い。無効なメンバーは道が欠ける）
                  className={`border-b border-line ${member.isActive ? "" : "text-ink-faint"}`}
                >
                  <td className="py-2">
                    <Link href={`/routines?edit=${member.id}`} className={linkAccent}>
                      {member.name}
                    </Link>
                  </td>
                  <td className="py-2 text-sm">{mode?.name ?? <UnsetMark />}</td>
                  <td className="py-2 text-sm">{describeRecurrence(member)}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums">
                    <DurationValue minutes={member.estimateMinutes} />
                  </td>
                  <td className="py-2 tabular-nums">
                    <MasterEditableCell
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

      {slowPending && (
        <div className={bottomCenterStack}>
          <PendingIndicator />
        </div>
      )}
    </div>
  );
}
