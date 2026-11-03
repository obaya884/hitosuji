// ルーチン管理（S-02）の編集フォームを開いた状態で着地する URL（画面定義書02 O-2）。
// 入口はバンドル管理のメンバー名リンク（画面定義書05 O-7）とデイリーの行メニュー（画面定義書01 O-19）。
// 受け口は routines/page.tsx が `?edit=` を読む
import type { RoutineId } from "@/domain/routine/routine";

export function routineEditHref(id: RoutineId): string {
  return `/routines?edit=${id}`;
}
