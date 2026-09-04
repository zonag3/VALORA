import {
  json,requireDb,verifyAdmin,normalizeCode,isV10CodePattern,
  cleanText,randomV10Code
} from "../../_lib.js";

async function makeUniqueCode(env) {
  for (let i=0;i<100;i++) {
    const code = randomV10Code();
    const exists = await env.DB.prepare("SELECT 1 FROM survey_codes WHERE code=?").bind(code).first();
    if (!exists) return code;
  }
  throw new Error("No se pudo generar un código único");
}

async function controlFor(env,id) {
  return env.DB.prepare(`
    SELECT COALESCE(blocked,0) AS blocked,
           COALESCE(protected,0) AS protected,
           COALESCE(is_demo,0) AS is_demo
    FROM code_controls
    WHERE code_id=?
  `).bind(id).first();
}

export async function onRequestPost({request,env}) {
  try {
    requireDb(env);
    if (!(await verifyAdmin(request,env))) return json({ok:false,error:"unauthorized"},401);

    const body = await request.json().catch(()=>({}));
    const surveyId = Number(body.surveyId);
    if (!surveyId) return json({ok:false,error:"invalid_survey"},400);

    let code = body.code ? normalizeCode(body.code) : null;
    if (body.code && !code) return json({ok:false,error:"invalid_code_format"},400);
    if (code && !isV10CodePattern(code)) return json({ok:false,error:"invalid_v10_pattern"},400);
    if (!code) code = await makeUniqueCode(env);

    try {
      const result = await env.DB.prepare(`
        INSERT INTO survey_codes(survey_id,code,first_name,last_name,email,phone)
        VALUES(?,?,?,?,?,?)
      `).bind(
        surveyId,code,
        cleanText(body.firstName,120),
        cleanText(body.lastName,180),
        cleanText(body.email,240),
        cleanText(body.phone,80)
      ).run();
      return json({ok:true,id:Number(result.meta.last_row_id),code});
    } catch (err) {
      if (String(err).toLowerCase().includes("unique")) return json({ok:false,error:"duplicate_code"},409);
      throw err;
    }
  } catch (err) {
    console.error(err);
    return json({ok:false,error:"server"},500);
  }
}

export async function onRequestPut({request,env}) {
  try {
    requireDb(env);
    if (!(await verifyAdmin(request,env))) return json({ok:false,error:"unauthorized"},401);

    const body = await request.json().catch(()=>({}));
    const id = Number(body.id);
    const current = await env.DB.prepare("SELECT * FROM survey_codes WHERE id=?").bind(id).first();
    if (!current) return json({ok:false,error:"not_found"},404);

    const controls = await controlFor(env,id);
    const isProtected = Number(controls?.protected || 0) === 1;

    if (typeof body.blocked === "boolean") {
      await env.DB.prepare(`
        INSERT INTO code_controls(code_id,blocked,protected,is_demo,updated_at)
        VALUES(?,?,0,0,CURRENT_TIMESTAMP)
        ON CONFLICT(code_id) DO UPDATE SET
          blocked=excluded.blocked,
          updated_at=CURRENT_TIMESTAMP
      `).bind(id,body.blocked?1:0).run();
      return json({ok:true,blocked:body.blocked});
    }

    let code = current.code;
    if (body.code && !isProtected) {
      const normalized = normalizeCode(body.code);
      if (!normalized) return json({ok:false,error:"invalid_code_format"},400);
      if (!isV10CodePattern(normalized)) return json({ok:false,error:"invalid_v10_pattern"},400);
      if (Number(current.used) === 0) code = normalized;
    }

    try {
      await env.DB.prepare(`
        UPDATE survey_codes SET
          code=?,first_name=?,last_name=?,email=?,phone=?
        WHERE id=?
      `).bind(
        code,
        cleanText(body.firstName,120),
        cleanText(body.lastName,180),
        cleanText(body.email,240),
        cleanText(body.phone,80),
        id
      ).run();
      return json({ok:true});
    } catch (err) {
      if (String(err).toLowerCase().includes("unique")) return json({ok:false,error:"duplicate_code"},409);
      throw err;
    }
  } catch (err) {
    console.error(err);
    return json({ok:false,error:"server"},500);
  }
}

export async function onRequestDelete({request,env}) {
  try {
    requireDb(env);
    if (!(await verifyAdmin(request,env))) return json({ok:false,error:"unauthorized"},401);

    const body = await request.json().catch(()=>({}));
    const id = Number(body.id);
    const current = await env.DB.prepare(`
      SELECT c.id,c.used,c.code,COALESCE(cc.protected,0) AS protected
      FROM survey_codes c
      LEFT JOIN code_controls cc ON cc.code_id=c.id
      WHERE c.id=?
    `).bind(id).first();

    if (!current) return json({ok:false,error:"not_found"},404);
    if (Number(current.protected) === 1) return json({ok:false,error:"protected_code"},409);

    const responseIds = await env.DB.prepare(
      "SELECT id FROM survey_responses WHERE survey_code_id=?"
    ).bind(id).all();
    const ids = (responseIds.results || []).map(r=>r.id);

    if (ids.length) {
      const marks = ids.map(()=>"?").join(",");
      await env.DB.prepare(`DELETE FROM survey_answers WHERE response_id IN (${marks})`).bind(...ids).run();
      await env.DB.prepare(`DELETE FROM survey_responses WHERE id IN (${marks})`).bind(...ids).run();
    }

    await env.DB.prepare("DELETE FROM code_controls WHERE code_id=?").bind(id).run();
    await env.DB.prepare("DELETE FROM survey_codes WHERE id=?").bind(id).run();
    return json({ok:true});
  } catch (err) {
    console.error(err);
    return json({ok:false,error:"server"},500);
  }
}
