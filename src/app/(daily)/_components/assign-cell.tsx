import { UnsetMark } from "@/app/_components/unset-mark";
import { SelectPopover, type PopoverOption } from "./select-popover";

export type AssignCellProps = Readonly<{
  /** 列の名前。未設定行でもボタンの用途が読めるよう aria-label に使う */
  label: string;
  /** 割り当て済みマスタの名前。未設定なら undefined */
  name?: string;
  options: readonly PopoverOption[];
  selectedId: number | null;
  /** モード未設定の行を既定のグレーにするクラス（呼び出し側が行単位で決める） */
  dimmed: string;
  isEditing: boolean;
  onOpen: () => void;
  onSelect: (id: number | null) => void;
  onClose: () => void;
}>;

/**
 * プロジェクト列・モード列のセル（§3.3「プロジェクト列・モード列の共通規則」/ O-5）。
 * 2列は同じ見た目・同じ表記に揃える規則のため、片方だけ変わらないよう1つに集約する。
 * セル全体を押せるようにし、列幅に収まらない名前は切り詰める（行高は変えない。N-05）
 */
export function AssignCell({
  label,
  name,
  options,
  selectedId,
  dimmed,
  isEditing,
  onOpen,
  onSelect,
  onClose,
}: AssignCellProps) {
  return (
    <td className={`relative py-2.5 text-sm ${dimmed}`}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${label}（${name ?? "未設定"}）`}
        className="block max-w-full truncate text-left hover:underline"
      >
        {name ?? <UnsetMark />}
      </button>
      {isEditing && (
        <SelectPopover
          options={options}
          selectedId={selectedId}
          onSelect={onSelect}
          onClose={onClose}
        />
      )}
    </td>
  );
}
