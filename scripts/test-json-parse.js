// scripts/test-json-parse.js
// 使い方: node scripts/test-json-parse.js
// DB最新データを取得して全パース・新フィールドを確認する
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

  const res = await client.query(`
    SELECT
      id, status, overall_score, issue_count, critical_count,
      suggested_task_count, feature_count, raw_ai_response,
      execution_mode, input_tokens, output_tokens, estimated_cost_usd,
      model_used, loop_count, prompt_log, created_at, completed_at
    FROM project_analyses
    WHERE raw_ai_response IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `);

  if (res.rows.length === 0) { console.log("❌ 分析レコードなし"); await client.end(); return; }

  const row = res.rows[0];
  await client.end();

  console.log("=== DBから最新データ取得 ===");
  console.log("id:", row.id);
  console.log("status:", row.status);
  console.log("execution_mode:", row.execution_mode ?? "（カラム未追加）");
  console.log("overall_score:", row.overall_score);
  console.log("feature_count:", row.feature_count);
  console.log("issue_count:", row.issue_count);
  console.log("suggested_task_count:", row.suggested_task_count);
  console.log("input_tokens:", row.input_tokens ?? "（カラム未追加）");
  console.log("output_tokens:", row.output_tokens ?? "（カラム未追加）");
  console.log("estimated_cost_usd:", row.estimated_cost_usd
    ? `$${parseFloat(row.estimated_cost_usd).toFixed(6)}`
    : "（カラム未追加）");
  console.log("model_used:", row.model_used ?? "（カラム未追加）");
  console.log("loop_count:", row.loop_count ?? "（カラム未追加）");
  console.log("prompt_log:", row.prompt_log
    ? `あり（${(row.prompt_log instanceof Array ? row.prompt_log : []).length}ステップ）`
    : "（カラム未追加 or null）");
  console.log("raw_ai_response 総文字数:", row.raw_ai_response.length);

  // パート分割
  const parts = row.raw_ai_response.split(/\n---(?:RAW\d+|RAW2|RAW_FEAT\d+)---\n/);
  console.log("パート分割結果:", parts.length, "パート");
  parts.forEach((p, i) => console.log(`  パート${i + 1}: ${p.length}文字`));

  // RAW1: 総評・課題
  console.log("\n=== RAW1: 総評・課題 ===");
  try {
    const p = JSON.parse(extractJson(parts[0]));
    console.log("✅ overall_score:", p.overall_score);
    console.log("✅ issues:", (p.issues ?? []).length, "件");
    console.log("✅ strengths:", (p.strengths ?? []).length, "件");
    console.log("✅ immediate_actions:", (p.immediate_actions ?? []).length, "件");
  } catch (e) {
    console.log("❌ パース失敗:", e.message);
    console.log("  先頭100字:", parts[0]?.slice(0, 100));
  }

  // RAW2: 提案タスク
  if (parts[1]) {
    console.log("\n=== RAW2: 提案タスク ===");
    try {
      const p = JSON.parse(extractJson(parts[1]));
      console.log("✅ suggested_tasks:", (p.suggested_tasks ?? []).length, "件");
    } catch (e) {
      console.log("❌ パース失敗:", e.message);
    }
  }

  // RAW_FEAT: 機能実装状況
  const featParts = parts.slice(2);
  if (featParts.length > 0) {
    console.log(`\n=== RAW_FEAT: 機能実装状況（${featParts.length}パート） ===`);
    const allFeatures = [];
    for (let i = 0; i < featParts.length; i++) {
      try {
        const p = JSON.parse(extractJson(featParts[i]));
        const features = p.features ?? [];
        console.log(`✅ FEAT${i + 1}: features ${features.length}件, has_more: ${p.has_more}`);
        allFeatures.push(...features.filter(f => !allFeatures.some(e => e.name === f.name)));
      } catch (e) {
        console.log(`❌ FEAT${i + 1} パース失敗:`, e.message);
      }
    }
    console.log(`重複除去後の全features: ${allFeatures.length}件`);
    allFeatures.forEach((f, i) => {
      console.log(`  [${i + 1}] ${f.status} | ${f.name} (${f.progress_pct ?? 0}%)`);
    });
  }

  console.log("\n=== 最終結果 ===");
  if (row.status === "completed") {
    console.log("✅ DBのデータは正常");
  } else {
    console.log("⚠️ status:", row.status);
    if (row.error_message) console.log("   error_message:", row.error_message);
  }

  // マイグレーション確認
  console.log("\n=== マイグレーション状態確認 ===");
  const hasExecutionMode = row.execution_mode !== undefined;
  console.log(hasExecutionMode ? "✅ execution_mode カラム存在" : "❌ execution_mode カラム未追加（migration必要）");
  const hasCost = row.estimated_cost_usd !== undefined;
  console.log(hasCost ? "✅ estimated_cost_usd カラム存在" : "❌ estimated_cost_usd カラム未追加（migration必要）");
  const hasPromptLog = row.prompt_log !== undefined;
  console.log(hasPromptLog ? "✅ prompt_log カラム存在" : "❌ prompt_log カラム未追加（migration必要）");
}

main().catch(console.error);
