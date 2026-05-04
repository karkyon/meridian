"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  projectId: string;
  docType: string;
  docTypeLabel: string;
  onSuccess?: () => void;
};

export default function DocumentUploadButton({ projectId, docType, docTypeLabel, onSuccess }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("completeness", "100");

    const res = await fetch(
      `/api/projects/${projectId}/documents/${docType}/upload`,
      { method: "POST", body: formData }
    );

    const data = await res.json();

    if (res.ok) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      router.refresh();
      onSuccess?.();
    } else {
      const msg =
        data.error === "FILE_TOO_LARGE" ? "5MB以下のファイルを選択してください"
        : data.error === "INVALID_FILE_TYPE" ? "Word / PDF / Markdownのみ対応"
        : data.error === "TEXT_EXTRACTION_FAILED" ? "テキスト抽出に失敗しました"
        : "アップロードに失敗しました";
      setError(msg);
    }
    setUploading(false);
  }

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.doc,.pdf,.md,.markdown"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = ""; // リセット
        }}
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        title={`${docTypeLabel}をファイルからアップロード`}
        className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
          success
            ? "border-emerald-400 bg-emerald-50 text-emerald-600"
            : "border-slate-200 hover:border-[#1D6FA4] hover:bg-[#1D6FA4]/5 text-slate-500 hover:text-[#1D6FA4]"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {uploading ? (
          <>
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>処理中</span>
          </>
        ) : success ? (
          <>
            <span>✓</span>
            <span>完了</span>
          </>
        ) : (
          <>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>アップロード</span>
          </>
        )}
      </button>

      {error && (
        <div className="absolute top-full left-0 mt-1 bg-red-50 border border-red-200 text-red-600 text-[10px] px-2 py-1 rounded-lg whitespace-nowrap z-10">
          {error}
        </div>
      )}
    </div>
  );
}
