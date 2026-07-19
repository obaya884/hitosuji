"use client";

import { useEffect, useState } from "react";

/**
 * 毎分更新される現在時刻（画面定義書01 §3.3/§7: 経過時間はクライアントタイマーで更新し通信しない）。
 * 分の境界に合わせて刻むので、表示上の分が変わる瞬間に更新される
 */
export function useNow(enabled: boolean): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!enabled) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = () => {
      const current = new Date();
      setNow(current);
      // 次の分の境界までの残りミリ秒
      const delay = 60_000 - (current.getSeconds() * 1000 + current.getMilliseconds());
      timeoutId = setTimeout(tick, delay);
    };

    tick();
    return () => clearTimeout(timeoutId);
  }, [enabled]);

  return now;
}
