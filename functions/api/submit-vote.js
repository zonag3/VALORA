import { json, requireEnv, sbFetch, normalizeCode } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  try {
    requireEnv(env);
    const body = await request.json().catch(() => ({}));
    const code = normalizeCode(body.code);
    const answers = Array.isArray(body.answers) ? body.answers.map(Number) : [];

    if (!code || answers.length !== 5 || answers.some(v => !Number.isInteger(v) || v < 1 || v > 5)) {
      return json({ ok:false, error:"invalid_data" }, 400);
    }

    const comment = String(body.comment || "").slice(0,500);

    const res = await sbFetch(env, "rpc/submit_vote", {
      method: "POST",
      body: JSON.stringify({
        p_code: code,
        p_q1: answers[0],
        p_q2: answers[1],
        p_q3: answers[2],
        p_q4: answers[3],
        p_q5: answers[4],
        p_comment: comment || null
      })
    });

    if (!res.ok) {
      const txt = await res.text();
      if (txt.includes("code_used")) return json({ok:false,error:"used"},409);
      if (txt.includes("invalid_code")) return json({ok:false,error:"invalid_code"},404);
      return json({ok:false,error:"database"},500);
    }

    return json({ ok:true });
  } catch (err) {
    return json({ ok:false, error:"server", detail:String(err.message || err) }, 500);
  }
}
