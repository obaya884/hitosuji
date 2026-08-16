import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { hasClass } from "@/app/_testing/dom";
import { SLOW_PENDING_DELAY_MS } from "@/app/_lib/use-slow-pending";
import { TableFrame } from "./table-frame";

/**
 * エラー帯（`noticeDanger`）。文言ではなく帯そのものを探すので、
 * 「文言が空のまま帯だけ出る」形の後退も捕まえられる
 */
const errorNotice = (container: HTMLElement) =>
  [...container.querySelectorAll("p")].find((p) => hasClass(p, "bg-danger-weak")) ?? null;

function renderFrame(
  props: Partial<{
    description: ReactNode;
    countLabel: string;
    error: string | null;
    isPending: boolean;
    addLabel: string;
    onAddNew: () => void;
  }> = {}
) {
  return render(
    <TableFrame
      // **既定値へ落とさず「渡されたか」で分ける**——`?? 既定` にすると説明文なし
      // （バンドル管理 S-05 §2）を渡せず、その分岐の検証が書けなくなる
      description={"description" in props ? props.description : "並び順は名前順です。"}
      // 既定は「渡さない」（本数を出すのはルーチン管理だけ。画面定義書02 §3）
      countLabel={props.countLabel}
      error={props.error ?? null}
      isPending={props.isPending ?? false}
      // 渡さないときは既定の「新規追加」になる（マスタ管理3表はこちら）
      addLabel={props.addLabel}
      onAddNew={props.onAddNew ?? vi.fn()}
    >
      <table>
        <tbody>
          <tr>
            <td>マスタA</td>
          </tr>
        </tbody>
      </table>
    </TableFrame>
  );
}

describe("TableFrame（画面定義書02 §3 / 画面定義書03 §3・§4: 説明文・新規追加・エラー帯を管理画面の表で共通にする）", () => {
  it("説明文と「新規追加」と表の中身を出す", () => {
    renderFrame();

    expect(screen.getByText("並び順は名前順です。")).not.toBeNull();
    expect(screen.getByRole("button", { name: "新規追加" })).not.toBeNull();
    expect(screen.getByText("マスタA")).not.toBeNull();
  });

  // 説明文を持たない表もある（バンドル管理 S-05 §2「見出し行には『＋ 新規追加』だけを置き、
  // 説明文は書かない」）。空の段落を置くと、無い説明のぶん見出し行が間延びする
  it("説明文を渡さなければ説明の段落を描かず、「新規追加」は残る（05 §2）", () => {
    const { container } = renderFrame({ description: undefined });

    expect(container.querySelectorAll("p")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "新規追加" })).not.toBeNull();
  });

  it("失敗が無いときはエラー帯を出さない（空の帯を置いて間延びさせない）", () => {
    const { container } = renderFrame({ error: null });

    expect(errorNotice(container)).toBeNull();
  });

  it("失敗のメッセージを受け取ったらエラー帯に出す", () => {
    const { container } = renderFrame({ error: "名前を入力してください" });

    expect(errorNotice(container)?.textContent).toBe("名前を入力してください");
  });

  // 帯は説明行の下・表の上（3表に直書きされていた並びの唯一の持ち主になったので、ここで固定する）
  it("エラー帯は見出し行と表の間に置く", () => {
    const { container } = renderFrame({ error: "名前を入力してください" });
    const notice = errorNotice(container);
    const table = container.querySelector("table");

    expect(notice?.compareDocumentPosition(table as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("失敗が解消したら帯を消す（次の編集を始めると null が渡る）", () => {
    const { container, rerender } = renderFrame({ error: "名前を入力してください" });
    expect(errorNotice(container)).not.toBeNull();

    rerender(
      <TableFrame description="並び順は名前順です。" error={null} isPending={false} onAddNew={vi.fn()}>
        <table />
      </TableFrame>
    );

    expect(errorNotice(container)).toBeNull();
  });

  // sections は説明文を2行に折った断片で渡す（1つの文字列にすると継ぎ目の空白が消える）
  it("説明文は文字列でも JSX の断片でも受け取れる", () => {
    renderFrame({
      description: (
        <>
          編集できるのは開始時刻だけです。
          先頭のラジオで「1日の開始」になるセクションを選べます。
        </>
      ),
    });

    expect(screen.getByText(/編集できるのは開始時刻だけです。 先頭のラジオで/)).not.toBeNull();
  });

  // 表が増えるたびに枠を写さないための唯一の可変部分（画面定義書02 §3。ルーチン管理は「新規ルーチン」）。
  // **既定側も同じテストで見る**——ヘルパの既定値に依らせると、渡し方を変えた瞬間に黙って検証が消える
  it("新規追加ボタンの文言は既定が「新規追加」で、渡せば表ごとに差し替わる", () => {
    const { rerender } = renderFrame();
    expect(screen.getByRole("button", { name: "新規追加" })).not.toBeNull();

    rerender(
      <TableFrame
        description="並び順は名前順です。"
        error={null}
        isPending={false}
        addLabel="新規ルーチン"
        onAddNew={vi.fn()}
      >
        <table />
      </TableFrame>
    );

    expect(screen.getByRole("button", { name: "新規ルーチン" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "新規追加" })).toBeNull();
  });

  // 本数は見出し行の可変部分（画面定義書02 §3）。**値の組み立ては表側**なので、
  // ここで見るのは「渡した文言を出すか」「どこに置くか」「どの段で出すか」の3つ。
  // **「出すのはルーチン管理だけ」はこの段では担保できない**——条項の実体は各表が
  // 渡さないことなので、部品からは「渡されなければ出さない」までしか言えない
  describe("見出し行の本数（画面定義書02 §3）", () => {
    const COUNT = "12 / 15 件";

    it("本数を渡すと見出し行に出す", () => {
      renderFrame({ countLabel: COUNT });

      expect(screen.getByText(COUNT)).not.toBeNull();
    });

    // 説明文は既定のまま渡し、**本数の有無だけで段落の数が動く**ことを見る
    // （説明文を落とす形にすると `description` の分岐と交絡し、count 側が無防備になる）
    it("本数を渡さなければ段落を増やさない", () => {
      const { container } = renderFrame();

      expect(container.querySelectorAll("p")).toHaveLength(1);
      expect(screen.getByText("並び順は名前順です。")).not.toBeNull();
    });

    // 「ボタンの左」は右寄せの塊の中での話。文書順だけを見ると、見出し行の**左端**
    // （説明文より前）へ移しても緑のままなので、同じ親にいることまで固定する
    it("本数は新規追加ボタンと同じ塊に入り、ボタンの左に置く", () => {
      renderFrame({ countLabel: COUNT });
      const count = screen.getByText(COUNT);
      const button = screen.getByRole("button", { name: "新規追加" });

      expect(count.parentElement).toBe(button.parentElement);
      expect(count.compareDocumentPosition(button)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    // 文字の段は**メタ**（00_共通 §1.1）。値が確定しているので薄色の未設定表記（同 §2.4）は使わない
    it("本数はメタの段で出し、未設定の薄色にはしない", () => {
      renderFrame({ countLabel: COUNT });
      const count = screen.getByText(COUNT);

      expect(hasClass(count, "text-xs")).toBe(true);
      expect(hasClass(count, "text-ink-muted")).toBe(true);
      expect(hasClass(count, "text-ink-faint")).toBe(false);
    });

    // 右端揃え（ml-auto）は jsdom では測れない（幾何）ので、指定があることだけでも固定する。
    // **本数の有無で右端が動かない**ことがこの構造の要点なので、両方の場合で見る
    // （ml-auto がボタン側へ戻ると、本数を渡した画面だけボタンの位置がずれる）
    it.each([
      ["本数を渡したとき", { countLabel: COUNT }],
      ["本数を渡さないとき", {}],
    ])("%s も、本数とボタンの塊ごと右端へ寄せる", (_name, props) => {
      renderFrame(props);
      const group = screen.getByRole("button", { name: "新規追加" }).parentElement;

      expect(hasClass(group as HTMLElement, "ml-auto")).toBe(true);
    });
  });

  it("「新規追加」で新規行を開く合図を返す（開くのに要る初期化は表側が持つ）", () => {
    const onAddNew = vi.fn();
    renderFrame({ onAddNew });

    fireEvent.click(screen.getByRole("button", { name: "新規追加" }));

    expect(onAddNew).toHaveBeenCalledOnce();
  });

  it("保存中は「新規追加」を押せない（開いていたセルが閉じてしまう。00_共通 §2.3）", () => {
    const onAddNew = vi.fn();
    renderFrame({ isPending: true, onAddNew });

    const button = screen.getByRole("button", { name: "新規追加" });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);

    expect(onAddNew).not.toHaveBeenCalled();
  });

  // この画面の更新はすべて「確定を待つ操作」なので、応答待ちがそのまま合図の対象になる
  // （画面定義書02 §1 / 03 §1・00_共通 §4.2）。**猶予そのものの契約は `useSlowPending` 側**で、
  // ここで見るのは「`isPending` を合図へ配線できているか」と見た目の条項
  describe("進行中の合図（00_共通 §4.2）", () => {
    const indicator = () => screen.queryByRole("status");

    it("応答待ちが猶予を超えたら「保存中」を出す", async () => {
      vi.useFakeTimers();
      renderFrame({ isPending: true });
      expect(indicator()).toBeNull();

      await act(async () => {
        vi.advanceTimersByTime(SLOW_PENDING_DELAY_MS);
      });

      expect(indicator()?.textContent).toBe("保存中");
    });

    it("応答待ちでないあいだは出さない", () => {
      renderFrame({ isPending: false });

      expect(indicator()).toBeNull();
    });

  });
});
