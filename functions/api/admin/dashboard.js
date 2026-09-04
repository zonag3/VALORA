import {
  json,requireDb,verifyAdmin,getSurvey,getActiveSurvey,getQuestions,parseOptions
} from "../../_lib.js";

export async function onRequestGet({request,env}) {
  try {
    requireDb(env);
    if (!(await verifyAdmin(request,env))) return json({ok:false,error:"unauthorized"},401);

    const url = new URL(request.url);
    let surveyId = Number(url.searchParams.get("surveyId") || 0);
    let survey = surveyId ? await getSurvey(env,surveyId) : await getActiveSurvey(env);
    if (!survey) {
      const fallback = await env.DB.prepare("SELECT * FROM surveys ORDER BY id DESC LIMIT 1").first();
      survey = fallback || null;
    }
    if (!survey) return json({ok:true,survey:null,stats:null,codes:[],responses:[],questionStats:[]});
    surveyId = Number(survey.id);

    const [questions,codesResult,responsesResult,answersResult] = await Promise.all([
      getQuestions(env,surveyId,true),
      env.DB.prepare(`
        SELECT
          c.id,c.code,c.first_name,c.last_name,c.email,c.phone,
          c.first_access_at,c.last_access_at,c.used,c.used_at,c.created_at,
          COALESCE(cc.blocked,0) AS blocked,
          COALESCE(cc.protected,0) AS protected,
          COALESCE(cc.is_demo,0) AS is_demo
        FROM survey_codes c
        LEFT JOIN code_controls cc ON cc.code_id=c.id
        WHERE c.survey_id=?
        ORDER BY cc.is_demo DESC,c.id DESC
        LIMIT 10000
      `).bind(surveyId).all(),
      env.DB.prepare(`
        SELECT
          r.id,r.comment,r.average,r.created_at,
          c.id AS code_id,c.code,c.first_name,c.last_name,c.email,c.phone
        FROM survey_responses r
        JOIN survey_codes c ON c.id=r.survey_code_id
        WHERE r.survey_id=?
        ORDER BY r.created_at DESC
        LIMIT 10000
      `).bind(surveyId).all(),
      env.DB.prepare(`
        SELECT
          a.response_id,a.question_id,a.numeric_value,a.answer_text
        FROM survey_answers a
        JOIN survey_responses r ON r.id=a.response_id
        WHERE r.survey_id=?
      `).bind(surveyId).all()
    ]);

    const codes = (codesResult.results || []).map(c=>{
      const used = Number(c.used)===1;
      const accessed = !!c.first_access_at;
      return {
        id:Number(c.id),
        code:c.code,
        firstName:c.first_name || "",
        lastName:c.last_name || "",
        email:c.email || "",
        phone:c.phone || "",
        firstAccessAt:c.first_access_at,
        lastAccessAt:c.last_access_at,
        used,
        usedAt:c.used_at,
        createdAt:c.created_at,
        blocked:Number(c.blocked)===1,
        protected:Number(c.protected)===1,
        isDemo:Number(c.is_demo)===1,
        status:used ? "answered" : accessed ? "accessed" : "unused"
      };
    });

    const answerRows = answersResult.results || [];
    const byResponse = new Map();
    for (const a of answerRows) {
      if (!byResponse.has(a.response_id)) byResponse.set(a.response_id,[]);
      byResponse.get(a.response_id).push({
        questionId:Number(a.question_id),
        numericValue:a.numeric_value == null ? null : Number(a.numeric_value),
        text:a.answer_text ?? ""
      });
    }

    const responses = (responsesResult.results || []).map(r=>({
      id:r.id,
      codeId:Number(r.code_id),
      code:r.code,
      firstName:r.first_name || "",
      lastName:r.last_name || "",
      email:r.email || "",
      phone:r.phone || "",
      average:r.average == null ? null : Number(r.average),
      comment:r.comment || "",
      createdAt:r.created_at,
      answers:byResponse.get(r.id) || []
    }));

    const responseCount = responses.length;
    const totalCodes = codes.length;
    const accessedPending = codes.filter(c=>c.status==="accessed").length;
    const unused = codes.filter(c=>c.status==="unused").length;
    const participation = totalCodes ? Math.round(responseCount/totalCodes*100) : 0;

    const allScale = answerRows
      .filter(a=>{
        const q = questions.find(q=>Number(q.id)===Number(a.question_id));
        return q?.question_type === "scale" && a.numeric_value != null;
      })
      .map(a=>Number(a.numeric_value));

    const overallRating = allScale.length
      ? Number((allScale.reduce((a,b)=>a+b,0)/allScale.length).toFixed(1))
      : null;

    const distributionCounts = {1:0,2:0,3:0,4:0,5:0};
    const ratedResponses = responses.filter(r=>r.average != null);
    for (const r of ratedResponses) {
      const n = Math.max(1,Math.min(5,Math.round(r.average)));
      distributionCounts[n]++;
    }
    const distribution = {};
    for (const n of [1,2,3,4,5]) {
      distribution[n] = ratedResponses.length
        ? Math.round(distributionCounts[n]/ratedResponses.length*100)
        : 0;
    }

    const questionStats = questions.map(q=>{
      const rows = answerRows.filter(a=>Number(a.question_id)===Number(q.id));
      const base = {
        id:Number(q.id),
        text:q.question_text,
        type:q.question_type,
        options:parseOptions(q.options_json),
        count:rows.length
      };

      if (q.question_type === "scale") {
        const nums = rows.map(r=>Number(r.numeric_value)).filter(Number.isFinite);
        return {
          ...base,
          average:nums.length ? Number((nums.reduce((a,b)=>a+b,0)/nums.length).toFixed(1)) : null
        };
      }

      if (q.question_type === "yes_no") {
        const yes = rows.filter(r=>Number(r.numeric_value)===1).length;
        const no = rows.filter(r=>Number(r.numeric_value)===0).length;
        return {
          ...base,yes,no,
          yesPercent:rows.length ? Math.round(yes/rows.length*100) : 0
        };
      }

      if (q.question_type === "choice") {
        const counts = {};
        for (const opt of parseOptions(q.options_json)) counts[opt]=0;
        for (const r of rows) counts[r.answer_text]=(counts[r.answer_text]||0)+1;
        return {...base,counts};
      }

      return {
        ...base,
        samples:rows.map(r=>r.answer_text).filter(Boolean).slice(-20).reverse()
      };
    });

    return json({
      ok:true,
      survey:{
        id:surveyId,
        title:survey.title,
        brandName:survey.brand_name,
        active:Number(survey.active)===1,
        allowComments:Number(survey.allow_comments)===1
      },
      stats:{
        totalCodes,responseCount,accessedPending,unused,participation,
        overallRating,distribution
      },
      questionStats,
      codes,
      responses,
      recent:responses.slice(0,5)
    });
  } catch (err) {
    console.error(err);
    return json({ok:false,error:"server"},500);
  }
}
