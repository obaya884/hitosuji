// マスタ（モード・プロジェクト）の表示順（画面定義書03 §4: name 昇順の自然順ソート）
// `01.仕事` のような接頭辞による並び制御を意図どおりに効かせるため数値を数値として比較する
const collator = new Intl.Collator("ja", { numeric: true, sensitivity: "base" });

export function compareByName<T extends { readonly name: string }>(a: T, b: T): number {
  return collator.compare(a.name, b.name);
}

export function sortByName<T extends { readonly name: string }>(items: readonly T[]): T[] {
  return [...items].sort(compareByName);
}
