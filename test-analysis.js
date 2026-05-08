// scripts/test-analysis-parse.js
// 使い方: node scripts/test-analysis-parse.js

const { execSync } = require("child_process");

function parseAiResponse(rawText) {
  const codeBlockMatch = rawText.match(/```json\s*([\s\S]*?)```/);
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  const cleanText = codeBlockMatch
    ? codeBlockMatch[1].trim()
    : jsonMatch ? jsonMatch[0] : rawText.trim();
  return JSON.parse(cleanText);
}

// DBから実際のraw_ai_responseを取得
let rawText;
try {
  const result = execSync(
    `PGPASSWORD=meridian_secret psql -h localhost -p 5442 -U meridian -d meridian_db -t -A -c "SELECT raw_ai_response FROM project_analyses WHERE raw_ai_response IS NOT NULL ORDER BY created_at DESC LIMIT 1;"`,
    { encoding: "utf8" }
  );
  rawText = result.trim();
  console.log("✅ DBから取得成功（先頭100字）:", rawText.slice(0, 100));
} catch(e) {
  console.log("❌ DB取得失敗:", e.message);
  process.exit(1);
}

// パーステスト
try {
  const r = parseAiResponse(rawText);
  console.log("\n✅ パース成功！");
  console.log("  overall_score     :", r.overall_score);
  console.log("  summary先頭50字   :", (r.summary || "").slice(0, 50));
  console.log("  strengths         :", (r.strengths || []).length + "件");
  console.log("  immediate_actions :", (r.immediate_actions || []).length + "件");
  console.log("  issues            :", (r.issues || []).length + "件");
  console.log("  suggested_tasks   :", (r.suggested_tasks || []).length + "件");
  console.log("\n✅ このロジックでroute.tsは正常動作します");
} catch(e) {
  console.log("\n❌ パース失敗:", e.message);
  console.log("rawText先頭300字:\n", rawText.slice(0, 300));
  process.exit(1);
}