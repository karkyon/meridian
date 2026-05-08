// src/types/tech-stack.ts

export type TechCategory =
  | "language"
  | "frontend"
  | "backend"
  | "database"
  | "orm"
  | "auth"
  | "infra"
  | "ai_ml"
  | "testing"
  | "tooling"
  | "other";

export interface TechStackItem {
  id: string;
  projectId: string;
  name: string;
  category: TechCategory;
  version: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
}

/** ProjectForm / API リクエスト用（id なし） */
export interface TechStackInput {
  name: string;
  category: TechCategory;
  version?: string;
  notes?: string;
}

// ----------------------------------------------------------------
// カテゴリ メタデータ
// ----------------------------------------------------------------
export const TECH_CATEGORY_META: Record<
  TechCategory,
  { label: string; emoji: string; color: string; examples: string[] }
> = {
  language: {
    label: "言語",
    emoji: "💬",
    color: "bg-violet-100 text-violet-800 border-violet-200",
    examples: ["TypeScript", "Python", "Go", "Rust", "Java", "Kotlin", "Swift"],
  },
  frontend: {
    label: "フロントエンド",
    emoji: "🎨",
    color: "bg-sky-100 text-sky-800 border-sky-200",
    examples: ["Next.js", "React", "Vue", "Svelte", "Nuxt", "Remix", "Tailwind CSS"],
  },
  backend: {
    label: "バックエンド",
    emoji: "⚙️",
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
    examples: ["Express", "FastAPI", "NestJS", "Hono", "Django", "Spring Boot"],
  },
  database: {
    label: "データベース",
    emoji: "🗄️",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    examples: ["PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "DynamoDB"],
  },
  orm: {
    label: "ORM / クエリ",
    emoji: "🔗",
    color: "bg-orange-100 text-orange-800 border-orange-200",
    examples: ["Prisma", "Drizzle", "TypeORM", "SQLAlchemy", "Sequelize"],
  },
  auth: {
    label: "認証",
    emoji: "🔒",
    color: "bg-red-100 text-red-800 border-red-200",
    examples: ["NextAuth.js", "Auth0", "Clerk", "Firebase Auth", "Supabase Auth"],
  },
  infra: {
    label: "インフラ / クラウド",
    emoji: "☁️",
    color: "bg-slate-100 text-slate-800 border-slate-200",
    examples: ["Docker", "Vercel", "AWS", "GCP", "Railway", "Cloudflare", "Nginx"],
  },
  ai_ml: {
    label: "AI / ML",
    emoji: "🤖",
    color: "bg-purple-100 text-purple-800 border-purple-200",
    examples: ["Claude API", "OpenAI", "LangChain", "Hugging Face", "TensorFlow"],
  },
  testing: {
    label: "テスト",
    emoji: "🧪",
    color: "bg-lime-100 text-lime-800 border-lime-200",
    examples: ["Jest", "Vitest", "Playwright", "Cypress", "Testing Library"],
  },
  tooling: {
    label: "ツール",
    emoji: "🛠️",
    color: "bg-rose-100 text-rose-800 border-rose-200",
    examples: ["ESLint", "Prettier", "Turborepo", "Vite", "Webpack", "GitHub Actions"],
  },
  other: {
    label: "その他",
    emoji: "📦",
    color: "bg-gray-100 text-gray-700 border-gray-200",
    examples: [],
  },
};

export const TECH_CATEGORY_ORDER: TechCategory[] = [
  "language",
  "frontend",
  "backend",
  "database",
  "orm",
  "auth",
  "infra",
  "ai_ml",
  "testing",
  "tooling",
  "other",
];

/** techStack の string[] への変換（後方互換・AI プロンプト用） */
export function techStackToStringArray(items: TechStackItem[]): string[] {
  return items.map((t) => (t.version ? `${t.name} ${t.version}` : t.name));
}

/** カテゴリ別にグループ化 */
export function groupByCategory(
  items: TechStackItem[]
): Partial<Record<TechCategory, TechStackItem[]>> {
  const result: Partial<Record<TechCategory, TechStackItem[]>> = {};
  for (const item of items) {
    if (!result[item.category]) result[item.category] = [];
    result[item.category]!.push(item);
  }
  return result;
}