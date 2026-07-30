// src/lib/secret-scan.ts
//
// 概要タブの env_vars / security_notes 等、本来「値」を保存してはいけない
// フィールドに秘密情報（APIキー・トークン・秘密鍵など）が誤って入力された場合に
// 検知するための共通ユーティリティ。
//
// 設計方針:
// - env_vars は「キー名・説明・必須フラグ・isSecretフラグ」のみを保持し、
//   実際の値（トークン本体）は絶対にDBへ保存しない。
// - それでも description 等の自由記述欄に値を貼り付けてしまうケースを
//   正規表現ヒューリスティックで検知し、保存を拒否する。
// - 将来 ProbeCore（脆弱性・セキュリティスキャナー）と連携する際、
//   Webhookペイロードや読み取りAPIレスポンスの事前サニタイズにもこの関数を再利用する想定。

const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "OpenAI-style key",      pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "GitHub token",          pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: "AWS Access Key ID",     pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Slack token",           pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "Google API key",        pattern: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { name: "PEM private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "Generic bearer token",  pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]{20,}=*\b/ },
  { name: "JWT-like token",        pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
];

export type SecretScanResult = {
  hasSecret: boolean;
  matches: string[]; // 検知したパターン名のリスト（値そのものは含めない）
};

/**
 * 単一の文字列に秘密情報らしきパターンが含まれるかを検査する。
 * 検知結果には「どのパターン名にマッチしたか」のみを含み、マッチした値自体は返さない
 * （ログ等に誤って値が残るのを防ぐため）。
 */
export function scanForSecrets(value: string | null | undefined): SecretScanResult {
  if (!value) return { hasSecret: false, matches: [] };
  const matches = SECRET_PATTERNS.filter((p) => p.pattern.test(value)).map((p) => p.name);
  return { hasSecret: matches.length > 0, matches };
}

/**
 * 複数の文字列フィールドをまとめて検査する。
 * key は呼び出し側でエラーメッセージに使うためのフィールド名。
 */
export function scanFieldsForSecrets(
  fields: Record<string, string | null | undefined>
): { field: string; matches: string[] }[] {
  const results: { field: string; matches: string[] }[] = [];
  for (const [field, value] of Object.entries(fields)) {
    const { hasSecret, matches } = scanForSecrets(value);
    if (hasSecret) results.push({ field, matches });
  }
  return results;
}

// env_vars の1件分の型（実際の値は保持しない）
export type EnvVarMeta = {
  key: string;
  description?: string;
  required?: boolean;
  isSecret?: boolean;
};

/**
 * env_vars 配列を検査する。各要素の key / description に秘密情報らしき
 * パターンが含まれていないかをチェックする（value フィールド自体を
 * 型として受け付けていないため、混入経路は description への貼り付けのみ）。
 */
export function scanEnvVarsForSecrets(
  items: EnvVarMeta[]
): { index: number; field: string; matches: string[] }[] {
  const results: { index: number; field: string; matches: string[] }[] = [];
  items.forEach((item, index) => {
    const fieldResults = scanFieldsForSecrets({ key: item.key, description: item.description });
    for (const r of fieldResults) {
      results.push({ index, field: r.field, matches: r.matches });
    }
  });
  return results;
}
