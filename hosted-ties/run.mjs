// One-off test (not for merging): ask the hosted 70B model the checklist
// for the sentences where the two local models disagreed. Made-up test
// sentences only. Prints answers, never the account ID or token.
import { readFileSync } from "node:fs";
const B = "../backend/lib/reviewer/";
const { CHECKLIST_INSTRUCTIONS, CHECKLIST_SCHEMA, reviewMessage } = await import(B + "prompt.js");
const { runUrl, CLOUDFLARE_REVIEW_MODEL } = await import(B + "providers/cloudflare.js");
const rows = JSON.parse(readFileSync(new URL("ties.json", import.meta.url), "utf8"));
const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_AI_TOKEN: token } = process.env;
for (const r of rows) {
  const res = await fetch(runUrl(account, CLOUDFLARE_REVIEW_MODEL), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messages: [{ role: "system", content: CHECKLIST_INSTRUCTIONS }, { role: "user", content: reviewMessage(r) }],
      response_format: { type: "json_schema", json_schema: CHECKLIST_SCHEMA },
      temperature: 0,
      max_tokens: 120,
    }),
  });
  const body = await res.json().catch(() => ({}));
  let a = body?.result?.response;
  if (typeof a === "string") try { a = JSON.parse(a); } catch {}
  const answer = a && typeof a === "object" && "suitable" in a ? a : { error: res.status, codes: (body?.errors ?? []).map((e) => e.code) };
  console.log(`TIE #${r.row} ${r.expect} ${JSON.stringify(answer)}`);
}
