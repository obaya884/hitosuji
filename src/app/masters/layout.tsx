import { MasterTabs } from "./_components/master-tabs";

// 画面定義書03 §2: セクション / プロジェクト / モードをタブ切替で1画面に集約する
export default function MastersLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <h1 className="text-lg font-bold">マスタ管理</h1>
      <MasterTabs />
      {children}
    </>
  );
}
