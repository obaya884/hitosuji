"use client";

import type { Bundle } from "@/domain/bundle/bundle";
import type { Mode } from "@/domain/mode/mode";
import type { Task } from "@/domain/task/task";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { modeAppearance } from "@/app/_lib/mode-appearance";
import { inputBase } from "@/app/_lib/ui";
import type { EditField } from "../_lib/editing";
import { rowBackgroundClass } from "../_lib/row-background";
import { BundleRoadCell } from "./bundle-road-cell";

export type CommentRowProps = Readonly<{
  task: Task;
  /** バンドルの道（F-119 / §3.3）。2段で1件のタスクなので面と同じく帯もタスク行から伸ばす */
  bundle: Bundle | null;
  mode?: Mode;
  isSelected: boolean;
  /** この行が編集中のどの項目を開いているか（`showsCommentRow` と同じ入力で語る） */
  editing: EditField | null;
  onComment: (task: Task, rawComment: string) => void;
  onEndEdit: () => void;
}>;

/**
 * コメントの表示・編集行（F-206 / 画面定義書01 §3.3 / O-16）。タスク行の直下に置く独立した行で、
 * **読む場所と書く場所を一致させる**ため表示と入力欄が同じ位置を使う。
 * 長さの制限がないので折り返して全文を出す（切り詰めない）
 */
export function CommentRow({
  task,
  bundle,
  mode,
  isSelected,
  editing,
  onComment,
  onEndEdit,
}: CommentRowProps) {
  const { dimmedClass, colorStyle } = modeAppearance(mode);

  function commit(input: HTMLTextAreaElement) {
    onComment(task, input.value);
    onEndEdit();
  }

  // コメントだけ複数行入力なので `Shift+Enter` を改行に通す（§6）
  const onKeyDown = inlineEditKeyHandler({
    onEnter: commit,
    onEscape: onEndEdit,
    multiline: true,
  });

  return (
    <tr
      style={colorStyle}
      // 地色はタスク行と同じ規則で決める（§3.3。2行で1件のタスクなので面色を割らない）
      className={`border-b border-line ${rowBackgroundClass(task, isSelected)}`}
    >
      {/* 選択行の下に開くこの行にも帯を伸ばす（2段で1件のタスクなので面を割らない） */}
      <BundleRoadCell bundle={bundle} />
      {/* 打刻ボタン列は空ける。折り返す幅はタスク名列に揃え（§3.3）、右側の列は空セルで埋めて
          選択行の面色がコメント行でも途切れないようにする */}
      <td />
      <td className="pb-2.5">
        {editing === "comment" ? (
          <textarea
            autoFocus
            defaultValue={task.comment ?? ""}
            rows={rowsFor(task.comment)}
            onKeyDown={onKeyDown}
            onBlur={(e) => commit(e.currentTarget)}
            placeholder="コメント（Shift+Enter で改行）"
            className={`w-full resize-y ${inputBase}`}
          />
        ) : (
          // 補助表記なのでセクションの併記（§3.3）と同じ扱い（モード色を乗せて弱める）
          <p className={`whitespace-pre-wrap text-sm ${dimmedClass} opacity-80`}>{task.comment}</p>
        )}
      </td>
      <td colSpan={6} />
    </tr>
  );
}

/** 入力欄の初期の高さ。既存の改行を数え、短いコメントでも2行分は開けておく */
function rowsFor(comment: string | null): number {
  return Math.max(2, (comment ?? "").split("\n").length);
}
