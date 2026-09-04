import {
  json,requireDb,clientKey,normalizeCode,getActiveSurvey,getQuestions,
  publicSurvey,publicQuestion
} from "../_lib.js";

export async function onRequestPost({request,env}) {
  try {
    requireDb(env);
    const survey = await getActiveSurvey(env);
    if (!survey) return json({ok:false,error:"no_active_survey"},404);

    const body = await request.json().catch(()=>({}));
    const code = normalizeCode(body.code);
    if (!code) return json({ok:false,error:"invalid_format"},400);

    const key = await clientKey(request,env);
    const now = Math.floor(Date.now()/1000);

    const attempt = await env.DB.prepare(`
      SELECT consecutive_fails,escalation_level,locked_until,permanent_blocked
      FROM security_attempts_v10
      WHERE client_key=?
    `).bind(key).first();

    if (attempt?.locked_until && Number(attempt.locked_until) > now) {
      return json({
        ok:false,
        error:"locked",
        retryAfterSeconds:Number(attempt.locked_until)-now,
        escalationLevel:Number(attempt.escalation_level || 0),
        permanentAfterLock:Number(attempt.permanent_blocked) === 1
      },429);
    }

    if (Number(attempt?.permanent_blocked) === 1) {
      return json({ok:false,error:"permanent_ip_block"},403);
    }

    const found = await env.DB.prepare(`
      SELECT
        c.id,c.used,c.first_access_at,
        COALESCE(cc.blocked,0) AS blocked,
        COALESCE(cc.protected,0) AS protected,
        COALESCE(cc.is_demo,0) AS is_demo
      FROM survey_codes c
      LEFT JOIN code_controls cc ON cc.code_id=c.id
      WHERE c.survey_id=? AND c.code=?
      LIMIT 1
    `).bind(survey.id,code).first();

    if (!found) {
      const previousFails = Number(attempt?.consecutive_fails || 0);
      const newFails = previousFails + 1;
      let level = Number(attempt?.escalation_level || 0);
      let permanent = 0;
      let lockedUntil = null;

      if (newFails >= 3) {
        level = Math.min(6, level + 1);
        lockedUntil = now + level * 60 * 60;
        if (level >= 6) permanent = 1;
      }

      const storedFails = newFails >= 3 ? 0 : newFails;

      await env.DB.prepare(`
        INSERT INTO security_attempts_v10(
          client_key,consecutive_fails,escalation_level,
          locked_until,permanent_blocked,updated_at
        ) VALUES(?,?,?,?,?,?)
        ON CONFLICT(client_key) DO UPDATE SET
          consecutive_fails=excluded.consecutive_fails,
          escalation_level=excluded.escalation_level,
          locked_until=excluded.locked_until,
          permanent_blocked=excluded.permanent_blocked,
          updated_at=excluded.updated_at
      `).bind(key,storedFails,level,lockedUntil,permanent,now).run();

      if (lockedUntil) {
        return json({
          ok:false,error:"locked",
          retryAfterSeconds:level*60*60,
          escalationLevel:level,
          permanentAfterLock:permanent === 1
        },429);
      }

      return json({
        ok:false,error:"invalid_code",
        attemptsLeft:3-newFails,
        escalationLevel:level
      },404);
    }

    if (Number(found.blocked) === 1) {
      return json({ok:false,error:"blocked_code"},403);
    }

    if (Number(found.used) === 1) {
      return json({ok:false,error:"used"},409);
    }

    // Un acierto rompe la racha de fallos, pero conserva el nivel histórico de reincidencia.
    await env.DB.prepare(`
      INSERT INTO security_attempts_v10(
        client_key,consecutive_fails,escalation_level,locked_until,permanent_blocked,updated_at
      ) VALUES(?,0,0,NULL,0,?)
      ON CONFLICT(client_key) DO UPDATE SET
        consecutive_fails=0,
        locked_until=NULL,
        updated_at=excluded.updated_at
    `).bind(key,now).run();

    await env.DB.prepare(`
      UPDATE survey_codes
      SET first_access_at=COALESCE(first_access_at,CURRENT_TIMESTAMP),
          last_access_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(found.id).run();

    const questions = await getQuestions(env,survey.id,true);
    return json({
      ok:true,
      code,
      survey:publicSurvey(survey),
      questions:questions.map(publicQuestion)
    });
  } catch (err) {
    console.error(err);
    return json({ok:false,error:"server"},500);
  }
}
