import {json,requireDb,verifyAdmin,getSurvey,getQuestions} from "../../_lib.js";

export async function onRequestGet({request,env}) {
  try {
    requireDb(env);
    if (!(await verifyAdmin(request,env))) return json({ok:false,error:"unauthorized"},401);

    const result = await env.DB.prepare(`
      SELECT
        s.id,s.title,s.brand_name,s.active,s.created_at,s.updated_at,
        (SELECT COUNT(*) FROM survey_codes c WHERE c.survey_id=s.id) AS code_count,
        (SELECT COUNT(*) FROM survey_responses r WHERE r.survey_id=s.id) AS response_count
      FROM surveys s
      ORDER BY s.active DESC,s.id DESC
    `).all();

    return json({ok:true,surveys:result.results || []});
  } catch (err) {
    console.error(err);
    return json({ok:false,error:"server"},500);
  }
}

export async function onRequestPost({request,env}) {
  try {
    requireDb(env);
    if (!(await verifyAdmin(request,env))) return json({ok:false,error:"unauthorized"},401);

    const body = await request.json().catch(()=>({}));
    const cloneId = Number(body.cloneSurveyId || 0);
    let newId;

    if (cloneId > 0) {
      const source = await getSurvey(env,cloneId);
      if (!source) return json({ok:false,error:"not_found"},404);

      const insert = await env.DB.prepare(`
        INSERT INTO surveys(
          brand_name,eyebrow,title,intro_text,access_button_text,single_use_text,
          benefit1_title,benefit1_text,benefit2_title,benefit2_text,benefit3_title,benefit3_text,
          survey_eyebrow,survey_title,survey_description,
          comment_label,comment_placeholder,submit_button_text,
          thanks_eyebrow,thanks_title,thanks_text,
          hero_image_url,show_hero_image,allow_comments,
          accent_color,header_color,max_attempts,lock_minutes,active,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,CURRENT_TIMESTAMP)
      `).bind(
        source.brand_name,source.eyebrow,
        String(body.title || `${source.title} (copia)`).slice(0,160),
        source.intro_text,source.access_button_text,source.single_use_text,
        source.benefit1_title,source.benefit1_text,
        source.benefit2_title,source.benefit2_text,
        source.benefit3_title,source.benefit3_text,
        source.survey_eyebrow,source.survey_title,source.survey_description,
        source.comment_label,source.comment_placeholder,source.submit_button_text,
        source.thanks_eyebrow,source.thanks_title,source.thanks_text,
        source.hero_image_url,source.show_hero_image,source.allow_comments,
        source.accent_color,source.header_color,source.max_attempts,source.lock_minutes
      ).run();

      newId = Number(insert.meta.last_row_id);
      const qs = await getQuestions(env,cloneId,true);
      if (qs.length) {
        await env.DB.batch(qs.map(q=>env.DB.prepare(`
          INSERT INTO survey_questions(
            survey_id,question_text,question_type,options_json,position,required,active
          ) VALUES(?,?,?,?,?,?,1)
        `).bind(
          newId,q.question_text,q.question_type,q.options_json,q.position,q.required
        )));
      }
    } else {
      const title = String(body.title || "Nueva encuesta").trim().slice(0,160) || "Nueva encuesta";
      const insert = await env.DB.prepare(`
        INSERT INTO surveys(title,brand_name,eyebrow,survey_title,active)
        VALUES(?,?,'ENCUESTA','Responde las preguntas',0)
      `).bind(title,title).run();
      newId = Number(insert.meta.last_row_id);

      await env.DB.prepare(`
        INSERT INTO survey_questions(
          survey_id,question_text,question_type,position,required,active
        ) VALUES(?,'Escribe aquí tu primera pregunta','scale',1,1,1)
      `).bind(newId).run();
    }

    return json({ok:true,id:newId});
  } catch (err) {
    console.error(err);
    return json({ok:false,error:"server"},500);
  }
}
