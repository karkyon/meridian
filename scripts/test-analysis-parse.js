const { Client } = require("pg");

async function parseAiResponse(rawText) {
  const codeBlockMatch = rawText.match(/```json([\s\S]*?)```/);
  const extracted = codeBlockMatch ? codeBlockMatch[1] : rawText;
  let depth=0, start=-1, end=-1;
  for(let i=0;i<extracted.length;i++){
    if(extracted[i]==='{'){if(depth===0)start=i;depth++;}
    else if(extracted[i]==='}'){depth--;if(depth===0){end=i;break;}}
  }
  const jsonStr = start>=0&&end>=0 ? extracted.slice(start,end+1) : extracted.trim();
  return JSON.parse(jsonStr);
}

async function main() {
  const client = new Client({
    host:"localhost", port:5442, user:"meridian",
    password:"meridian_secret", database:"meridian_db"
  });
  await client.connect();
  const res = await client.query(
    "SELECT raw_ai_response FROM project_analyses WHERE raw_ai_response IS NOT NULL ORDER BY created_at DESC LIMIT 1"
  );
  await client.end();
  
  const rawText = res.rows[0].raw_ai_response;
  console.log("取得文字数:", rawText.length);
  console.log("先頭30字:", JSON.stringify(rawText.slice(0,30)));
  
  try {
    const r = await parseAiResponse(rawText);
    console.log("✅ パース成功 score:", r.overall_score, "issues:", (r.issues||[]).length, "tasks:", (r.suggested_tasks||[]).length);
  } catch(e) {
    console.log("❌ パース失敗:", e.message);
    const m = rawText.match(/```json([\s\S]*?)```/);
    const clean = m ? m[1] : rawText;
    const pos = parseInt(e.message.match(/position (\d+)/)?.[1]||"0");
    if(pos>0) console.log("問題箇所:", JSON.stringify(clean.slice(Math.max(0,pos-50),pos+50)));
  }
}
main().catch(console.error);
