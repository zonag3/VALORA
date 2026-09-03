import { json, requireEnv, sbFetch, verifyAdmin } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  try {
    requireEnv(env);
    if (!(await verifyAdmin(request, env))) return json({ok:false,error:"unauthorized"},401);

    const [codesRes, votesRes] = await Promise.all([
      sbFetch(env, "codes?select=id,code,used,used_at,created_at&order=created_at.desc&limit=5000"),
      sbFetch(env, "votes?select=id,code_id,q1,q2,q3,q4,q5,comment,average,created_at&order=created_at.desc&limit=5000")
    ]);

    if (!codesRes.ok || !votesRes.ok) return json({ok:false,error:"database"},500);

    const codes = await codesRes.json();
    const votesRaw = await votesRes.json();
    const codeMap = new Map(codes.map(c => [c.id, c.code]));

    const votes = votesRaw.map(v => ({
      id: v.id,
      code: codeMap.get(v.code_id) || "—",
      answers: [v.q1,v.q2,v.q3,v.q4,v.q5],
      average: Number(v.average),
      comment: v.comment || "",
      createdAt: v.created_at
    }));

    const totalCodes = codes.length;
    const votesCount = votes.length;
    const participation = totalCodes ? Math.round((votesCount/totalCodes)*100) : 0;
    const pending = Math.max(0,totalCodes-votesCount);

    const questionAverages = [0,1,2,3,4].map(i => {
      if (!votesCount) return 0;
      return Number((votes.reduce((s,v)=>s+Number(v.answers[i]),0)/votesCount).toFixed(1));
    });

    const overallRating = votesCount
      ? Number((votes.reduce((s,v)=>s+Number(v.average),0)/votesCount).toFixed(1))
      : null;

    const distributionCounts = {1:0,2:0,3:0,4:0,5:0};
    for (const v of votes) {
      const n = Math.max(1, Math.min(5, Math.round(Number(v.average))));
      distributionCounts[n]++;
    }

    const distribution = {};
    for (const n of [1,2,3,4,5]) {
      distribution[n] = votesCount
        ? Math.round(distributionCounts[n]/votesCount*100)
        : 0;
    }

    return json({
      ok:true,
      stats:{ totalCodes, votesCount, participation, pending, questionAverages, overallRating, distribution },
      recent:votes.slice(0,5),
      votes,
      codes:codes.map(c=>({
        code:c.code,
        used:c.used,
        usedAt:c.used_at,
        createdAt:c.created_at
      }))
    });
  } catch (err) {
    return json({ok:false,error:"server",detail:String(err.message || err)},500);
  }
}
