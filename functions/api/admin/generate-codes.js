import {json,requireDb,verifyAdmin,randomV10Code} from "../../_lib.js";

export async function onRequestPost({request,env}) {
  try {
    requireDb(env);
    if (!(await verifyAdmin(request,env))) return json({ok:false,error:"unauthorized"},401);

    const body = await request.json().catch(()=>({}));
    const surveyId = Number(body.surveyId);
    const count = Math.max(1,Math.min(500,Number(body.count || 10)));
    if (!surveyId) return json({ok:false,error:"invalid_survey"},400);

    const created = [];
    let rounds = 0;

    while (created.length < count && rounds < 40) {
      rounds++;
      const needed = count-created.length;
      const candidates = [...new Set(Array.from({length:needed*4},randomV10Code))];
      const statements = candidates.map(code =>
        env.DB.prepare("INSERT OR IGNORE INTO survey_codes(survey_id,code) VALUES(?,?)")
          .bind(surveyId,code)
      );
      const results = await env.DB.batch(statements);
      results.forEach((r,i)=>{
        if (Number(r?.meta?.changes || 0) === 1) created.push(candidates[i]);
      });
    }

    return json({ok:true,codes:created.slice(0,count)});
  } catch (err) {
    console.error(err);
    return json({ok:false,error:"server"},500);
  }
}
