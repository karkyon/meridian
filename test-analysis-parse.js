// scripts/test-analysis-parse.js
// node scripts/test-analysis-parse.js

const { Client } = require("pg");

// ── route.tsと完全同一のパース関数 ──────────────────────────────
function parseAiResponse(rawText) {
  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error("JSON部分が見つかりません");
  return JSON.parse(rawText.slice(start, end + 1));
}

// ── 調査フェーズ ────────────────────────────────────────────────
async function main() {
  const client = new Client({
    host: "localhost", port: 5442,
    user: "meridian", password: "meridian_secret", database: "meridian_db"
  });
  await client.connect();
  const res = await client.query(
    "SELECT raw_ai_response FROM project_analyses WHERE raw_ai_response IS NOT NULL ORDER BY created_at DESC LIMIT 1"
  );
  await client.end();

  const raw = res.rows[0]?.raw_ai_response;
  if (!raw) { console.log("❌ raw_ai_responseがNULLです"); return; }

  console.log("── 基本情報 ──────────────────────────────");
  console.log("型          :", typeof raw);
  console.log("文字数      :", raw.length);
  console.log("最初の { 位 :", raw.indexOf('{'));
  console.log("最後の } 位 :", raw.lastIndexOf('}'));
  console.log("先頭50字    :", JSON.stringify(raw.slice(0, 50)));
  console.log("末尾50字    :", JSON.stringify(raw.slice(-50)));

  // ── パーステスト ──────────────────────────────────────────────
  console.log("\n── パーステスト ──────────────────────────");
  try {
    const r = parseAiResponse(raw);
    console.log("✅ パース成功");
    console.log("  overall_score     :", r.overall_score);
    console.log("  summary(先頭40字) :", (r.summary||"").slice(0,40));
    console.log("  strengths         :", (r.strengths||[]).length + "件");
    console.log("  immediate_actions :", (r.immediate_actions||[]).length + "件");
    console.log("  issues            :", (r.issues||[]).length + "件");
    console.log("  suggested_tasks   :", (r.suggested_tasks||[]).length + "件");
  } catch(e) {
    console.log("❌ パース失敗:", e.message);
    const pos = parseInt(e.message.match(/position (\d+)/)?.[1] || "0");
    const start = raw.indexOf('{');
    if (pos > 0 && start >= 0) {
      const json = raw.slice(start);
      console.log("問題箇所(前後50字):", JSON.stringify(json.slice(Math.max(0,pos-50), pos+50)));
      // 問題文字のcharCode
      console.log("問題文字charCode  :", json.charCodeAt(pos));
    }
  }
}

main().catch(console.error);
