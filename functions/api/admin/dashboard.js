import {
  json,
  requireDb,
  verifyAdmin
} from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  try {
    requireDb(env);

    if (!(await verifyAdmin(request, env))) {
      return json({ ok:false, error:"unauthorized" }, 401);
    }

    const [codesResult, votesResult] = await Promise.all([
      env.DB.prepare(`
        SELECT code, used, used_at, created_at
        FROM codes
        ORDER BY id DESC
        LIMIT 5000
      `).all(),

      env.DB.prepare(`
        SELECT
          v.id,
          c.code,
          v.q1, v.q2, v.q3, v.q4, v.q5,
          v.comment,
          v.average,
          v.created_at
        FROM votes v
        INNER JOIN codes c ON c.id = v.code_id
        ORDER BY v.id DESC
        LIMIT 5000
      `).all()
    ]);

    const codes = codesResult.results || [];
    const rawVotes = votesResult.results || [];

    const votes = rawVotes.map(v => ({
      id:v.id,
      code:v.code,
      answers:[
        Number(v.q1), Number(v.q2), Number(v.q3),
        Number(v.q4), Number(v.q5)
      ],
      average:Number(v.average),
      comment:v.comment || "",
      createdAt:v.created_at
    }));

    const totalCodes = codes.length;
    const votesCount = votes.length;
    const participation = totalCodes
      ? Math.round((votesCount / totalCodes) * 100)
      : 0;
    const pending = Math.max(0, totalCodes - votesCount);

    const questionAverages = [0,1,2,3,4].map(i => {
      if (!votesCount) return 0;
      return Number(
        (votes.reduce((sum,v) => sum + v.answers[i], 0) / votesCount)
        .toFixed(1)
      );
    });

    const overallRating = votesCount
      ? Number(
          (votes.reduce((sum,v) => sum + v.average, 0) / votesCount)
          .toFixed(1)
        )
      : null;

    const distCount = {1:0,2:0,3:0,4:0,5:0};
    for (const vote of votes) {
      const rounded = Math.max(1, Math.min(5, Math.round(vote.average)));
      distCount[rounded]++;
    }

    const distribution = {};
    for (const n of [1,2,3,4,5]) {
      distribution[n] = votesCount
        ? Math.round((distCount[n] / votesCount) * 100)
        : 0;
    }

    return json({
      ok:true,
      stats:{
        totalCodes,
        votesCount,
        participation,
        pending,
        questionAverages,
        overallRating,
        distribution
      },
      recent:votes.slice(0,5),
      votes,
      codes:codes.map(c => ({
        code:c.code,
        used:Number(c.used) === 1,
        usedAt:c.used_at,
        createdAt:c.created_at
      }))
    });

  } catch (err) {
    console.error(err);
    return json({ ok:false, error:"server" }, 500);
  }
}
