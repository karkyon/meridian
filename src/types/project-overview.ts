// src/types/project-overview.ts

export type KeyFeature = {
  title: string;
  description?: string;
};

export type EnvVarItem = {
  key: string;
  description?: string;
  required?: boolean;
  isSecret?: boolean;
  // 注意: 実際の値（トークン本体）は絶対にここに保持しない。
  // 値はデプロイ環境の .env / シークレットマネージャーでのみ管理する。
};

export type ExternalDependency = {
  name: string;
  purpose?: string;
  url?: string;
};

export function parseKeyFeatures(value: unknown): KeyFeature[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
    .map((v) => ({
      title: typeof v.title === "string" ? v.title : "",
      description: typeof v.description === "string" ? v.description : undefined,
    }))
    .filter((v) => v.title.length > 0);
}

export function parseEnvVars(value: unknown): EnvVarItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
    .map((v) => ({
      key: typeof v.key === "string" ? v.key : "",
      description: typeof v.description === "string" ? v.description : undefined,
      required: typeof v.required === "boolean" ? v.required : undefined,
      isSecret: typeof v.isSecret === "boolean" ? v.isSecret : undefined,
    }))
    .filter((v) => v.key.length > 0);
}

export function parseExternalDependencies(value: unknown): ExternalDependency[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
    .map((v) => ({
      name: typeof v.name === "string" ? v.name : "",
      purpose: typeof v.purpose === "string" ? v.purpose : undefined,
      url: typeof v.url === "string" ? v.url : undefined,
    }))
    .filter((v) => v.name.length > 0);
}
