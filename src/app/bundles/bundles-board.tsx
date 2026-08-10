"use client";

// バンドル管理（S-05 / 画面定義書05）。左ペインの一覧・作成・アーカイブ・物理削除と、
// 右ペインのヘッダ（名前・色の編集・アーカイブ）とメンバー表（Task 10）まで。
// この画面は N-01（楽観的更新）の対象外で、保存の完了を待って一覧へ反映する（§1）。
//
// **保存境界（isPending）は画面全体で1つ**（00_共通 §4.2「再発火の抑止」——対象の行が
// 違っても確定を待つ操作をすべて受け付けない）。左ペイン・ヘッダ・メンバー表のどれかが
// 応答待ちのあいだは、他のどの操作も押せない（`useTransition` を1つだけ持つ）。
//
// エラーは `panelError`（{ scope; message } の1スロット）に持つ。**表示は自分の scope の
// ときだけ**（左ペイン・ヘッダ→"board" は TableFrame の帯、メンバー表→"members" はメンバー表
// 自身の帯）。**クリアも自分の scope のときだけ**——`clearBoardError`/`clearMembersError` は
// 他方の scope のエラーが出ている間は何もしない。これが無いと「片方のペインを触っただけで
// 他方の未解決のエラーが消える」（00_共通 §4.1「失敗はすべて画面に出す」に反する。レビュー
// 指摘で発覚）。新しい Server Action を実行するとき（`runScoped`）だけは無条件にクリアする——
// それは実際に新しい応答を待ち始める瞬間なので、古い通知を残す理由が無い
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { callAction, handleActionFailure, type ActionResult } from "@/app/_lib/action-result";
import { linkMuted } from "@/app/_lib/ui";
import type { Bundle, BundleId } from "@/domain/bundle/bundle";
import type { Mode } from "@/domain/mode/mode";
import type { Routine } from "@/domain/routine/routine";
import { colorPresetName } from "@/domain/shared/color-presets";
import type { BundleListView } from "@/usecases/bundle/bundle-usecases";
import { TableFrame } from "@/app/_components/table-frame";
import { ColorPickerPopover, DEFAULT_COLOR } from "@/app/_components/color-picker";
import { ArchivedMasterSection } from "@/app/_components/archived-master-section";
import { MasterEditableCell } from "@/app/_components/master-editable-cell";
import { MasterNewRow, MasterNewRowInput } from "@/app/_components/master-new-row";
import { BundleMembersTable } from "./bundle-members-table";
import {
  createBundleAction,
  deleteBundleAction,
  setBundleArchivedAction,
  updateBundleAction,
} from "./actions";

type Props = Readonly<{
  bundles: BundleListView;
  routines: readonly Routine[];
  /** メンバー表の表示用マスタ。アーカイブ済みも含む */
  modes: readonly Mode[];
}>;

/** エラーの発生源。表示・クリアの両方をこの単位で振り分ける（上のコメント参照） */
type ErrorScope = "board" | "members";

export function BundlesBoard({ bundles, routines, modes }: Props) {
  // 選択は id で持ち、描画時に active から解決する（選択中のバンドルがアーカイブ・削除で
  // 消えたときは先頭へ戻る。デイリーの `keepSelection` と同じ発想）
  const [selectedId, setSelectedId] = useState<BundleId | null>(null);
  // 編集中のセル（`"new"` は新規追加行）。値は入力欄の DOM が持つ
  const [editingId, setEditingId] = useState<BundleId | "new" | null>(null);
  const [newColor, setNewColor] = useState<string>(DEFAULT_COLOR);
  const [colorPickerId, setColorPickerId] = useState<BundleId | "new" | null>(null);
  // 保存境界は画面全体で1つ（上のコメント参照）。`useServerAction` を使わないのは、あちらの
  // `error` が単一の文字列で発生源を持たないため——ここでは `panelError` が代わりを担う
  const [isPending, startTransition] = useTransition();
  const [panelError, setPanelError] = useState<Readonly<{
    scope: ErrorScope;
    message: string;
  }> | null>(null);
  const router = useRouter();

  const selectedBundle =
    bundles.active.find((b) => b.id === selectedId) ?? bundles.active[0] ?? null;

  /** 指定した scope の Server Action を実行する。開始時は無条件にエラーをクリアする（上のコメント） */
  function runScoped<T extends ActionResult>(
    scope: ErrorScope,
    action: () => Promise<T>,
    onSuccess?: (result: T) => void
  ): void {
    setPanelError(null);
    startTransition(async () => {
      const result = await callAction(action);
      if (result.ok) {
        onSuccess?.(result);
        return;
      }
      handleActionFailure(result, {
        setError: (message) => setPanelError({ scope, message }),
        refresh: () => router.refresh(),
      });
    });
  }

  /** 左ペイン・ヘッダの `run` */
  function runPanel<T extends ActionResult>(
    action: () => Promise<T>,
    onSuccess?: (result: T) => void
  ): void {
    runScoped("board", action, onSuccess);
  }

  /** 左ペイン・ヘッダのエラーをその場で消す（新しい編集を始めたとき）。
   *  すでに出ているのが他方（members）のエラーなら何もしない */
  function clearBoardError() {
    setPanelError((prev) => (prev?.scope === "board" ? null : prev));
  }

  /** メンバー表の `run`（メンバー表へ props で渡す） */
  function runMembers<T extends ActionResult>(
    action: () => Promise<T>,
    onSuccess?: (result: T) => void
  ): void {
    runScoped("members", action, onSuccess);
  }

  /**
   * メンバー表向けの `setError`（メンバー表へ props で渡す）。非 null は新しい失敗（クライアント
   * 側の検証エラー等）なのでそのまま上書きする。null（クリア）は自分の scope のときだけ効かせる
   */
  function setMembersError(message: string | null) {
    if (message === null) {
      setPanelError((prev) => (prev?.scope === "members" ? null : prev));
      return;
    }
    setPanelError({ scope: "members", message });
  }

  /** 新規追加行を閉じる（開いていたプリセット選択も畳む） */
  function closeNewRow() {
    setEditingId(null);
    setColorPickerId(null);
  }

  /** ヘッダの色。カラーバーを押すとプリセット選択がその場に開き、選んだ色を即保存する（O-2） */
  const headerColorCell = (bundle: Bundle) => (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        disabled={isPending}
        onClick={() => setColorPickerId(bundle.id)}
        aria-label={`色を変更（現在: ${colorPresetName(bundle.color)}）`}
      >
        <span
          style={{ backgroundColor: bundle.color }}
          className="inline-block h-4 w-12 shrink-0 rounded-control"
          aria-hidden
        />
      </button>
      {colorPickerId === bundle.id && (
        <ColorPickerPopover
          selected={bundle.color}
          onSelect={(color) =>
            runPanel(
              () => updateBundleAction(bundle.id, { name: bundle.name, color }),
              () => setColorPickerId(null)
            )
          }
          onClose={() => setColorPickerId(null)}
        />
      )}
    </span>
  );

  /** ヘッダの名前。クリックでその場編集（O-2）。色は現在値のまま送る */
  const headerNameCell = (bundle: Bundle) => (
    <MasterEditableCell
      isEditing={editingId === bundle.id}
      value={bundle.name}
      isPending={isPending}
      onStartEditing={() => {
        clearBoardError();
        setEditingId(bundle.id);
      }}
      onCommit={(name) =>
        runPanel(
          () => updateBundleAction(bundle.id, { name, color: bundle.color }),
          () => setEditingId(null)
        )
      }
      onClose={() => setEditingId(null)}
    />
  );

  /** 新規追加行の色セル。選択はまだ送信せずローカルに保持し、保存ボタンでまとめて送る */
  const newColorCell = (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        disabled={isPending}
        onClick={() => setColorPickerId("new")}
        aria-label={`色を選択（現在: ${colorPresetName(newColor)}）`}
      >
        <span
          style={{ backgroundColor: newColor }}
          className="inline-block h-3 w-6 shrink-0 rounded-control"
          aria-hidden
        />
      </button>
      {colorPickerId === "new" && (
        <ColorPickerPopover selected={newColor} onSelect={setNewColor} onClose={() => setColorPickerId(null)} />
      )}
    </span>
  );

  const newRow = (
    <MasterNewRow
      isPending={isPending}
      onSave={(fieldValue) =>
        runPanel(
          () => createBundleAction({ name: fieldValue("name"), color: newColor }),
          (result) => {
            // 作成したバンドルを選択状態にする（O-1）
            if (result.ok) setSelectedId(result.id);
            closeNewRow();
          }
        )
      }
      onCancel={closeNewRow}
      renderCells={(onKeyDown) => (
        <>
          <td className="w-10 py-1 pl-1">{newColorCell}</td>
          <td className="py-1 pr-1">
            <MasterNewRowInput field="name" placeholder="バンドル名" autoFocus onKeyDown={onKeyDown} />
          </td>
        </>
      )}
    />
  );

  return (
    <div className="grid grid-cols-[15rem_1fr]">
      <div className="border-r border-line pr-4">
        <TableFrame
          description="色はプリセットから選択します。並び順は名前順です。作成すると選択されます。"
          error={panelError?.scope === "board" ? panelError.message : null}
          isPending={isPending}
          onAddNew={() => {
            clearBoardError();
            setNewColor(DEFAULT_COLOR);
            setEditingId("new");
          }}
        >
          <table className="mt-2 w-full">
            <tbody>
              {bundles.active.map((bundle) => (
                <tr
                  key={bundle.id}
                  className={`border-b border-line ${
                    bundle.id === selectedBundle?.id ? "bg-accent-weak" : "hover:bg-accent-weak"
                  }`}
                >
                  <td className="w-10 py-1.5 pl-1">
                    <span
                      style={{ backgroundColor: bundle.color }}
                      className="inline-block h-3 w-6 shrink-0 rounded-control"
                      aria-hidden
                    />
                  </td>
                  <td className="py-1.5 pr-1">
                    <span className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedId(bundle.id)}
                        className="truncate text-left hover:underline"
                      >
                        {bundle.name}
                      </button>
                      <span className="text-sm text-ink-muted">
                        {bundles.memberCounts[bundle.id] ?? 0}
                      </span>
                    </span>
                  </td>
                  {/* 新規追加行の保存/取消列と列数を揃える（行ごとの操作は右ペインのヘッダに寄せたのでここは空） */}
                  <td />
                </tr>
              ))}
              {editingId === "new" && newRow}
            </tbody>
          </table>

          <ArchivedMasterSection
            archived={bundles.archived}
            deletableIds={bundles.deletableIds}
            isPending={isPending}
            renderCells={(bundle) => (
              <>
                <td className="w-10 py-1.5 pl-1">
                  <span
                    style={{ backgroundColor: bundle.color }}
                    className="inline-block h-3 w-6 shrink-0 rounded-control opacity-50"
                    aria-hidden
                  />
                </td>
                <td className="py-1.5">{bundle.name}</td>
              </>
            )}
            onRestore={(id) => runPanel(() => setBundleArchivedAction(id, false))}
            onDelete={(id) => runPanel(() => deleteBundleAction(id))}
          />
        </TableFrame>
      </div>

      <div className="mt-4 pl-4">
        {selectedBundle === null ? (
          <p className="text-sm text-ink-muted">バンドルがありません</p>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-line pb-3">
              {headerColorCell(selectedBundle)}
              <div className="text-base font-medium">{headerNameCell(selectedBundle)}</div>
              <button
                type="button"
                onClick={() => runPanel(() => setBundleArchivedAction(selectedBundle.id, true))}
                disabled={isPending}
                className={`ml-auto px-2 ${linkMuted}`}
              >
                アーカイブ
              </button>
            </header>
            {/* key でバンドルを切り替えるたびに作り直す（編集中セル・候補一覧の開閉を前のバンドル
                から持ち越さない。routines-table.tsx の編集フォームと同じ発想）。保存境界
                （isPending / run）は画面全体で共有し、エラーだけこの表向けに振り分けたものを渡す */}
            <BundleMembersTable
              key={selectedBundle.id}
              bundle={selectedBundle}
              routines={routines}
              modes={modes}
              error={panelError?.scope === "members" ? panelError.message : null}
              setError={setMembersError}
              isPending={isPending}
              run={runMembers}
            />
          </>
        )}
      </div>
    </div>
  );
}
