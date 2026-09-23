"use client";

import type { Bundle } from "@/domain/bundle/bundle";
import type { Mode } from "@/domain/mode/mode";
import type { Task } from "@/domain/task/task";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { inputBase } from "@/app/_lib/ui";
import { DetailRow } from "./detail-row";

export type UrlRowProps = Readonly<{
  task: Task;
  /** バンドルの道（F-119 / §3.3）。コメント行と同じく2段で1件のタスクなので帯を伸ばす */
  bundle: Bundle | null;
  mode?: Mode;
  isSelected: boolean;
  onUrl: (task: Task, rawUrl: string) => void;
  onEndEdit: () => void;
}>;

/**
 * 参照先 URL の入力行（F-125 / 画面定義書01 O-18）。**編集中だけ**タスク行の直下に開く1行の入力欄で、
 * コメント行（O-16）と同じ外殻（`DetailRow`）を使う（行の下に開く編集の作法を2種類にしない）。
 * 表示のための行は持たない——URL は読むものではなく開くもので、有無は行の印（§3.3）で足りる
 */
export function UrlRow({ task, bundle, mode, isSelected, onUrl, onEndEdit }: UrlRowProps) {
  function commit(input: HTMLInputElement) {
    onUrl(task, input.value);
    onEndEdit();
  }

  const onKeyDown = inlineEditKeyHandler({ onEnter: commit, onEscape: onEndEdit });

  return (
    <DetailRow task={task} bundle={bundle} mode={mode} isSelected={isSelected}>
      {/* `type="url"` はブラウザが前後の空白を落とすので、送る値は既に trim 済み。
          http(s) の検証は盤面（`validateUrl`）が行う */}
      <input
        autoFocus
        type="url"
        defaultValue={task.url ?? ""}
        onKeyDown={onKeyDown}
        onBlur={(e) => commit(e.currentTarget)}
        placeholder="https://"
        className={`w-full ${inputBase}`}
      />
    </DetailRow>
  );
}
