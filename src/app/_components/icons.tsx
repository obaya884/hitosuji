// 自作のインラインSVGアイコン集（外部アイコンライブラリは使わない）。
// currentColor で描画し、意味は使用側のボタンの aria-label が持つ。

type IconProps = Readonly<{ className?: string }>;

function Svg({
  className = "h-3.5 w-3.5",
  children,
}: IconProps & Readonly<{ children: React.ReactNode }>) {
  return (
    <svg
      viewBox="0 0 14 14"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.2 2.6 11.2 7 4.2 11.4 Z" fill="currentColor" />
    </Svg>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" fill="currentColor" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M2.5 7.5 5.5 10.5 11.5 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function EllipsisIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="3" cy="7" r="1.2" fill="currentColor" />
      <circle cx="7" cy="7" r="1.2" fill="currentColor" />
      <circle cx="11" cy="7" r="1.2" fill="currentColor" />
    </Svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M8.8 2.8 4.6 7 8.8 11.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M5.2 2.8 9.4 7 5.2 11.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M7 2.5 V11.5 M2.5 7 H11.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * コメントのある行に出す印（F-206 / 画面定義書01 §3.3）。吹き出し。
 * 他のアイコンより枠いっぱいに描く——本文の文字とほぼ同じ大きさで並ぶため、
 * 余白が多いと隣の文字に対して沈んで見える
 */
export function CommentIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M1.5 2 H12.5 V9.5 H6.5 L3.5 12.5 V9.5 H1.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * ハイライトの印（F-118 / 画面定義書01 §3.3）。ON は塗りつぶし、OFF は輪郭だけ。
 * コメント印と同じく枠いっぱいに描く（本文の文字と並ぶため）
 */
export function StarIcon({ filled, ...props }: IconProps & Readonly<{ filled: boolean }>) {
  return (
    <Svg {...props}>
      <polygon
        points="7,1.2 8.8,4.8 12.8,5.4 9.9,8.25 10.6,12.25 7,10.35 3.4,12.25 4.1,8.25 1.2,5.4 5.2,4.8"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
