const { execSync } = require("child_process");

function parseAiResponse(rawText) {
  const codeBlockMatch = rawText.match(/```json\s*([\s\S]*?)```/s);
  const jsonMatch = rawText.match(/\{[\s\S]*\}/s);
  const cleanText = codeBlockMatch
    ? codeBlockMatch[1].trim()
    : jsonMatch ? jsonMatch[0] : rawText.trim();
  return JSON.parse(cleanText);
}

let rawText;
try {
  const result = execSync(
    `PGPASSWORD=meridian_secret psql -h localhost -p 5442 -U meridian -d meridian_db -t -A -c "SELECT raw_ai_response FROM project_analyses WHERE raw_ai_response IS NOT NULL ORDER BY created_at DESC LIMIT 1;"`,
    { encoding: "utf8" }
  );
  rawText = result.trim();
  console.log("取得文字数:", rawText.length);
} catch(e) {
  console.log("DB取得失敗:", e.message);
  process.exit(1);
}

// 問題箇所を特定
const codeBlockMatch = rawText.match(/```json\s*([\s\S]*?)```/s);
const cleanText = codeBlockMatch ? codeBlockMatch[1].trim() : rawText;

// 少しずつパースして問題箇所を特定
for (let i = 100; i <= cleanText.length; i += 100) {
  try {
    JSON.parse(cleanText.slice(0, i) + ']}}}');
  } catch(e) {
    const pos = parseInt(e.message.match(/position (\d+)/)?.[1] || "0");
    if (pos > 0 && pos < i) {
      console.log("\n❌ 問題箇所発見 position:", pos);
      console.log("前後20文字:", JSON.stringify(cleanText.slice(Math.max(0,pos-20), pos+20)));
      break;
    }
  }
}

try {
  const r = parseAiResponse(rawText);
  console.log("\n✅ パース成功 score:", r.overall_score, "issues:", (r.issues||[]).length, "tasks:", (r.suggested_tasks||[]).length);
} catch(e) {
  console.log("\n❌ パース失敗:", e.message);
  const pos = parseInt(e.message.match(/position (\d+)/)?.[1] || "0");
  if (pos > 0) console.log("問題箇所前後50文字:", JSON.stringify(cleanText.slice(Math.max(0,pos-50), pos+50)));
}
