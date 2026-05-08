// scripts/test-analysis-parse.js
const { Client } = require("pg");

// route.ts と完全同一の関数
function extractJson(text) {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("JSON開始位置({)が見つかりません");
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`JSONが不完全です（閉じ括弧不足。取得文字数: ${text.length}）`);
}

async function main() {
  const client = new Client({
    host: "localhost", port: 5442, user: "meridian",
    password: "meridian_secret", database: "meridian_db",
  });
  await client.connect();
  const res = await client.query(
    "SELECT raw_ai_response FROM project_analyses WHERE raw_ai_response IS NOT NULL ORDER BY created_at DESC LIMIT 1"
  );
  await client.end();

  const rawText = res.rows[0].raw_ai_response;
  console.log("取得文字数:", rawText.length);
  console.log("先頭30字  :", JSON.stringify(rawText.slice(0, 30)));

  // RAW2区切りがある場合は1回目だけ取り出す
  const raw1 = rawText.split("\n\n---RAW2---\n\n")[0];
  console.log("raw1文字数:", raw1.length);

  try {
    const jsonStr = extractJson(raw1);
    console.log("抽出JSON文字数:", jsonStr.length);
    const parsed = JSON.parse(jsonStr);
    console.log("\n✅ パース成功");
    console.log("  overall_score :", parsed.overall_score);
    console.log("  issues件数    :", (parsed.issues || []).length);
    console.log("  strengths件数 :", (parsed.strengths || []).length);
  } catch (e) {
    console.log("\n❌ パース失敗:", e.message);
    const start = raw1.indexOf("{");
    if (start >= 0) {
      const pos = parseInt((e.message.match(/position (\d+)/) || [])[1] || "0");
      if (pos > 0) {
        console.log("問題箇所(前後50字):", JSON.stringify(raw1.slice(Math.max(0, start + pos - 50), start + pos + 50)));
        console.log("問題文字charCode  :", raw1.charCodeAt(start + pos));
      }
    }
  }
}

main().catch(console.error);