import {
  json,requireDb,normalizeCode,cleanText,getSurvey,getQuestions,parseOptions
} from "../_lib.js";

export async function onRequestPost({request,env}) {
  try {
    requireDb(env);
    const body = await request.json().catch(()=>({}));
    const code = normalizeCode(body.code);
    const surveyId = Number(body.surveyId);
    const answers = body.answers && typeof body.answers === "object" ? body.answers : {};

    if (!code || !Number.isInteger(surveyId) || surveyId < 1) {
      return json({ok:false,error:"invalid_data"},400);
    }

    const survey = await getSurvey(env,surveyId);
    if (!survey) return json({ok:false,error:"survey_not_found"},404);

    const codeRow = await env.DB.prepare(`
      SELECT c.id,c.used,COALESCE(cc.blocked,0) AS blocked
      FROM survey_codes c
      LEFT JOIN code_controls cc ON cc.code_id=c.id
      WHERE c.survey_id = ? AND c.code = ?
      LIMIT 1
    `).bind(surveyId,code).first();

    if (!codeRow) return json({ok:false,error:"invalid_code"},404);
    if (Number(codeRow.blocked) === 1) return json({ok:false,error:"blocked_code"},403);
    if (Number(codeRow.used) === 1) return json({ok:false,error:"used"},409);

    const questions = await getQuestions(env,surveyId,true);
    const prepared = [];
    const scaleValues = [];

    for (const q of questions) {
      const raw = answers[String(q.id)] ?? answers[q.id];
      const missing = raw === undefined || raw === null || String(raw).trim() === "";

      if (missing) {
        if (Number(q.required) === 1) {
          return json({ok:false,error:"required_question",questionId:Number(q.id)},400);
        }
        continue;
      }

      if (q.question_type === "scale") {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1 || n > 5) {
          return json({ok:false,error:"invalid_answer",questionId:Number(q.id)},400);
        }
        scaleValues.push(n);
        prepared.push({questionId:Number(q.id),numeric:n,text:String(n)});
      } else if (q.question_type === "yes_no") {
        const normalized = String(raw).toLowerCase();
        if (!["yes","no","sí","si"].includes(normalized)) {
          return json({ok:false,error:"invalid_answer",questionId:Number(q.id)},400);
        }
        const yes = ["yes","sí","si"].includes(normalized);
        prepared.push({questionId:Number(q.id),numeric:yes?1:0,text:yes?"Sí":"No"});
      } else if (q.question_type === "choice") {
        const value = String(raw).trim();
        const options = parseOptions(q.options_json);
        if (!options.includes(value)) {
          return json({ok:false,error:"invalid_answer",questionId:Number(q.id)},400);
        }
        prepared.push({questionId:Number(q.id),numeric:null,text:value.slice(0,300)});
      } else if (q.question_type === "text") {
        prepared.push({questionId:Number(q.id),numeric:null,text:String(raw).trim().slice(0,1500)});
      }
    }

    const average = scaleValues.length
      ? scaleValues.reduce((a,b)=>a+b,0)/scaleValues.length
      : null;

    const comment = Number(survey.allow_comments) === 1
      ? cleanText(body.comment,1000)
      : null;

    const responseId = crypto.randomUUID();

    const statements = [
      env.DB.prepare(`
        INSERT OR IGNORE INTO survey_responses(
          id,survey_id,survey_code_id,comment,average
        )
        SELECT ?,?,id,?,?
        FROM survey_codes
        WHERE survey_id = ? AND code = ? AND used = 0
      `).bind(responseId,surveyId,comment,average,surveyId,code)
    ];

    for (const a of prepared) {
      statements.push(
        env.DB.prepare(`
          INSERT INTO survey_answers(response_id,question_id,numeric_value,answer_text)
          SELECT ?,?,?,?
          WHERE EXISTS(SELECT 1 FROM survey_responses WHERE id = ?)
        `).bind(responseId,a.questionId,a.numeric,a.text,responseId)
      );
    }

    statements.push(
      env.DB.prepare(`
        UPDATE survey_codes
        SET used = 1,
            used_at = CURRENT_TIMESTAMP,
            first_access_at = COALESCE(first_access_at,CURRENT_TIMESTAMP),
            last_access_at = CURRENT_TIMESTAMP
        WHERE survey_id = ? AND code = ?
          AND EXISTS(
            SELECT 1 FROM survey_responses
            WHERE survey_responses.survey_code_id = survey_codes.id
          )
      `).bind(surveyId,code)
    );

    const results = await env.DB.batch(statements);
    const inserted = Number(results?.[0]?.meta?.changes || 0);

    if (inserted !== 1) {
      const current = await env.DB.prepare(
        "SELECT used FROM survey_codes WHERE survey_id = ? AND code = ?"
      ).bind(surveyId,code).first();
      return json({ok:false,error:current ? "used" : "invalid_code"}, current ? 409 : 404);
    }

    return json({ok:true});
  } catch (err) {
    console.error(err);
    return json({ok:false,error:"server"},500);
  }
}
