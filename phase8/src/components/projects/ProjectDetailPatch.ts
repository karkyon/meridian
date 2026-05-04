// src/components/projects/ProjectDetailClient.tsx の
// TABSと「ドキュメント」タブボタン箇所を以下に差し替える

// TABS定義を変更:
// const TABS = ["概要", "ドキュメント", "WBS", "添付資料"] as const;

// 添付資料タブのコンテンツを追加:
// {tab === "添付資料" && (
//   <div className="max-w-3xl">
//     <div className="flex items-center justify-between mb-3">
//       <p className="text-xs text-slate-500">
//         Word / PDF / Markdownを保管し、AI生成の参照資料として活用できます
//       </p>
//       <Link href={`/projects/${project.id}/attachments`}
//         className="text-xs text-[#1D6FA4] hover:underline">
//         全画面で管理 →
//       </Link>
//     </div>
//     <AttachmentsSummary projectId={project.id} role={role} />
//   </div>
// )}

// このファイルの内容はプロジェクト詳細の差し替えパッチです
// 実際の変更はサーバー上で以下のpythonスクリプトで行います
export {};
