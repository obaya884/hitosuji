// セクション選択ポップオーバー（画面定義書01 O-5 / §4.3）の候補づくり。
// 固定項目の有無・表記・並びが仕様条項そのものなので、コンポーネントから切り出して純関数にする。
import { sectionRanges, type Section, type SectionId } from "@/domain/section/section";
import { UNCATEGORIZED_LABEL } from "@/app/_lib/unset";
import type { PopoverOption } from "../_components/select-popover";

/**
 * セクション選択肢（O-5 / F-112）。名前の右に時間帯 `開始–終了` を付記する（FB-46）。
 * 終了時刻は次セクション開始の導出（`sectionRanges`）。候補順は呼び出し側が渡す回転順
 * （日界起点。F-116）を保つため、並べ替えはせず endTime だけを引く。アーカイブ済みは出さない。
 *
 * 先頭には「現在のセクションへ」を固定項目として置き、区切り線で実セクション候補と分ける（§4.3）。
 * `currentSectionId` が null のとき（表示日が今日でない。§3.2 / F-121）は置かない。
 * 同じセクションが下の実候補にも並ぶが、そちらに印は付けない（§4.3「実セクション候補との重複」）
 */
export function toSectionOptions(
  sections: readonly Section[],
  currentSectionId: SectionId | null
): PopoverOption[] {
  // sectionRanges も !isArchived で絞る（section.ts activeSections）ため、有効セクションの id は
  // 必ず載る。get の undefined は Map の戻り型都合のみで、下のフォールバックは実際には描画されない
  const endTimeById = new Map(sectionRanges(sections).map((r) => [r.section.id, r.endTime]));
  const options: PopoverOption[] = [
    { id: null, label: UNCATEGORIZED_LABEL },
    ...sections
      .filter((s) => !s.isArchived)
      .map((s) => {
        const endTime = endTimeById.get(s.id);
        return {
          id: s.id,
          label: s.name,
          hint: endTime === undefined ? s.startTime : `${s.startTime}–${endTime}`,
        };
      }),
  ];

  // 表示日が今日でなければ「現在」は定義されず、固定項目も出さない（§4.3 / F-121）
  if (currentSectionId === null) return options;
  // 候補に出していないセクション（アーカイブ済み）は固定項目にも昇格させない。
  // 「現在」は有効セクションから導出される（section.ts currentSectionId）ため通常は必ず見つかる
  const current = sections.find((s) => s.id === currentSectionId && !s.isArchived);
  if (current === undefined) return options;

  // 表記は `現在のセクションへ（〈セクション名〉）`。時間帯は付記しない（§4.3「位置」）
  return [
    { id: current.id, label: `現在のセクションへ（${current.name}）`, isPinned: true },
    ...options,
  ];
}
