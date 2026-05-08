// scripts/test-features-parse.js
// 使い方: node scripts/test-features-parse.js
const { Client } = require("pg");

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
  throw new Error(`JSONが不完全です（閉じ括弧不足。文字数: ${text.length}）`);
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

  const rawAll = res.rows[0].raw_ai_response;

  // RAW1 / RAW2 / RAW3 に分割
  const parts = rawAll.split(/\n---RAW\d+---\n/);
  console.log(`分割結果: ${parts.length}パート`);
  parts.forEach((p, i) => console.log(`  RAW${i + 1}: ${p.length}文字`));

  const raw3 = parts[2] ?? "";
  console.log(`\nRAW3先頭50字: ${JSON.stringify(raw3.slice(0, 50))}`);
  console.log(`RAW3末尾50字: ${JSON.stringify(raw3.slice(-50))}`);

  // { } 深さ追跡でJSON抽出
  try {
    const jsonStr = extractJson(raw3);
    console.log(`\n抽出JSON文字数: ${jsonStr.length}`);
    const parsed = JSON.parse(jsonStr);
    const features = parsed.features ?? [];
    console.log(`✅ パース成功: features ${features.length}件`);
    features.forEach((f, i) => {
      console.log(`  [${i + 1}] ${f.name} (${f.status}) ${f.progress_pct}%`);
    });
  } catch (e) {
    console.log(`\n❌ パース失敗: ${e.message}`);

    // 途中切れ調査
    const start = raw3.indexOf("{");
    if (start >= 0) {
      // 最後の完全なfeatureオブジェクトを数える
      const partial = raw3.slice(start);
      const completeItems = (partial.match(/"spec_ref"\s*:/g) || []).length;
      console.log(`  途中まで完成しているfeature数: 約${completeItems}件`);
      console.log(`  末尾100字: ${JSON.stringify(partial.slice(-100))}`);

      // max_tokensいくつ必要か試算
      const avgPerFeature = partial.length / Math.max(completeItems, 1);
      const estimatedTotal = avgPerFeature * 20; // 20件想定
      console.log(`\n  1件あたり平均文字数: ${Math.round(avgPerFeature)}`);
      console.log(`  20件全体の推定文字数: ${Math.round(estimatedTotal)}`);
      console.log(`  必要なmax_tokens(目安): ${Math.round(estimatedTotal / 3)}`);
    }
  }
}

main().catch(console.error);
