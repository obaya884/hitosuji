import type { ReactNode } from "react";
import { linkAccent } from "@/app/_lib/ui";
import { DeleteButton } from "./delete-button";

/**
 * アーカイブ済み一覧（`<details>` 折りたたみ）。復元と、参照0件なら削除を置く
 * （画面定義書03 §4 / 05 §5）。
 * ラベル列（名前・色・開始時刻など）は表ごとに違うため `renderCells` で受け取る。
 */
export function ArchivedSection<T extends { id: number }>({
  archived,
  deletableIds,
  isPending,
  renderCells,
  onRestore,
  onDelete,
}: Readonly<{
  archived: readonly T[];
  deletableIds: readonly number[];
  isPending: boolean;
  /** ラベル列の `<td>` 群（アクション列は本コンポーネントが付ける） */
  renderCells: (item: T) => ReactNode;
  onRestore: (id: number) => void;
  onDelete: (id: number) => void;
}>) {
  if (archived.length === 0) return null;

  return (
    <details className="mt-6">
      <summary className="cursor-pointer text-sm text-ink-muted">
        アーカイブ済み（{archived.length}）
      </summary>
      <table className="mt-2 w-full">
        <tbody>
          {archived.map((item) => (
            <tr key={item.id} className="border-b border-line text-ink-muted">
              {renderCells(item)}
              <td className="w-32 py-2 text-right whitespace-nowrap">
                <button
                  onClick={() => onRestore(item.id)}
                  disabled={isPending}
                  className={`px-2 ${linkAccent}`}
                >
                  復元
                </button>
                {deletableIds.includes(item.id) && (
                  <DeleteButton onDelete={() => onDelete(item.id)} disabled={isPending} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
