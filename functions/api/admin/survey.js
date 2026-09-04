import {
  json,requireDb,verifyAdmin,getSurvey,getQuestions,cleanText,cleanColor,parseOptions
} from "../../_lib.js";

function value(v,fallback,max=500) {
  const s = String(v ?? fallback ?? "").trim();
  return s.slice(0,max);
}

export async function onRequestGet({request,env}) {
  try {
    requireDb(env);
    if (!(await verifyAdmin(request,env))) return json({ok:false,error:"unauthorized"},401);

    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    const survey = await getSurvey(env,id);
    if (!survey) return json({ok:false,error:"not_found"},404);

    const questions = await getQuestions(env,id,true);
    return json({
      ok:true,
      survey,
      questions:questions.map(q=>({
        id:Number(q.id),
        text:q.question_text,
        type:q.question_type,
        options:parseOptions(q.options_json),
        position:Number(q.position),
        required:Number(q.required)===1
      }))
    });
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
    const existing = await getSurvey(env,id);
    if (!existing) return json({ok:false,error:"not_found"},404);

    const s = body.survey || {};
    const active = s.active ? 1 : 0;

    if (active) {
      await env.DB.prepare("UPDATE surveys SET active=0 WHERE id <> ?").bind(id).run();

      const demo = await env.DB.prepare(`
        SELECT id,survey_id
        FROM survey_codes
        WHERE code='333-666'
        LIMIT 1
      `).first();

      if (demo && Number(demo.survey_id) !== id) {
        const responseIds = await env.DB.prepare(
          "SELECT id FROM survey_responses WHERE survey_code_id=?"
        ).bind(demo.id).all();

        const ids = (responseIds.results || []).map(r=>r.id);
        if (ids.length) {
          const marks = ids.map(()=>"?").join(",");
          await env.DB.prepare(
            `DELETE FROM survey_answers WHERE response_id IN (${marks})`
          ).bind(...ids).run();
          await env.DB.prepare(
            `DELETE FROM survey_responses WHERE id IN (${marks})`
          ).bind(...ids).run();
        }

        await env.DB.prepare(`
          UPDATE survey_codes
          SET survey_id=?,used=0,used_at=NULL,first_access_at=NULL,last_access_at=NULL
          WHERE id=?
        `).bind(id,demo.id).run();

        await env.DB.prepare(`
          INSERT INTO code_controls(code_id,blocked,protected,is_demo,updated_at)
          VALUES(?,0,1,1,CURRENT_TIMESTAMP)
          ON CONFLICT(code_id) DO UPDATE SET
            protected=1,is_demo=1,updated_at=CURRENT_TIMESTAMP
        `).bind(demo.id).run();
      } else if (!demo) {
        const inserted = await env.DB.prepare(`
          INSERT INTO survey_codes(survey_id,code)
          VALUES(?,'333-666')
        `).bind(id).run();

        const demoId = Number(inserted.meta.last_row_id);
        await env.DB.prepare(`
          INSERT INTO code_controls(code_id,blocked,protected,is_demo)
          VALUES(?,0,1,1)
        `).bind(demoId).run();
      }
    }

    await env.DB.prepare(`
      UPDATE surveys SET
        brand_name=?,eyebrow=?,title=?,intro_text=?,
        access_button_text=?,single_use_text=?,
        benefit1_title=?,benefit1_text=?,
        benefit2_title=?,benefit2_text=?,
        benefit3_title=?,benefit3_text=?,
        survey_eyebrow=?,survey_title=?,survey_description=?,
        comment_label=?,comment_placeholder=?,submit_button_text=?,
        thanks_eyebrow=?,thanks_title=?,thanks_text=?,
        hero_image_url=?,show_hero_image=?,allow_comments=?,
        accent_color=?,header_color=?,max_attempts=?,lock_minutes=?,
        active=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(
      value(s.brandName,existing.brand_name,160),
      value(s.eyebrow,existing.eyebrow,100),
      value(s.title,existing.title,200),
      value(s.introText,existing.intro_text,600),
      value(s.accessButtonText,existing.access_button_text,80),
      value(s.singleUseText,existing.single_use_text,300),
      value(s.benefit1Title,existing.benefit1_title,120),
      value(s.benefit1Text,existing.benefit1_text,300),
      value(s.benefit2Title,existing.benefit2_title,120),
      value(s.benefit2Text,existing.benefit2_text,300),
      value(s.benefit3Title,existing.benefit3_title,120),
      value(s.benefit3Text,existing.benefit3_text,300),
      value(s.surveyEyebrow,existing.survey_eyebrow,100),
      value(s.surveyTitle,existing.survey_title,200),
      value(s.surveyDescription,existing.survey_description,600),
      value(s.commentLabel,existing.comment_label,150),
      value(s.commentPlaceholder,existing.comment_placeholder,300),
      value(s.submitButtonText,existing.submit_button_text,100),
      value(s.thanksEyebrow,existing.thanks_eyebrow,100),
      value(s.thanksTitle,existing.thanks_title,200),
      value(s.thanksText,existing.thanks_text,600),
      value(s.heroImageUrl,existing.hero_image_url,500),
      s.showHeroImage ? 1 : 0,
      s.allowComments ? 1 : 0,
      cleanColor(s.accentColor,existing.accent_color || "#6f4fe8"),
      cleanColor(s.headerColor,existing.header_color || "#101d3b"),
      Math.max(1,Math.min(20,Number(s.maxAttempts || existing.max_attempts || 5))),
      Math.max(1,Math.min(120,Number(s.lockMinutes || existing.lock_minutes || 10))),
      active,
      id
    ).run();

    const questions = Array.isArray(body.questions) ? body.questions : [];
    const submittedIds = [];

    for (let i=0;i<questions.length;i++) {
      const q = questions[i];
      const text = String(q.text || "").trim().slice(0,1000);
      if (!text) continue;

      const type = ["scale","yes_no","choice","text"].includes(q.type) ? q.type : "scale";
      let optionsJson = null;
      if (type === "choice") {
        const options = Array.isArray(q.options)
          ? q.options.map(x=>String(x).trim()).filter(Boolean).slice(0,30)
          : [];
        if (options.length < 2) {
          return json({ok:false,error:"choice_needs_options",questionIndex:i},400);
        }
        optionsJson = JSON.stringify(options);
      }

      const qid = Number(q.id || 0);
      if (qid > 0) {
        const result = await env.DB.prepare(`
          UPDATE survey_questions SET
            question_text=?,question_type=?,options_json=?,
            position=?,required=?,active=1,updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND survey_id=?
        `).bind(
          text,type,optionsJson,i+1,q.required===false?0:1,qid,id
        ).run();
        if (Number(result.meta.changes || 0) > 0) submittedIds.push(qid);
      } else {
        const result = await env.DB.prepare(`
          INSERT INTO survey_questions(
            survey_id,question_text,question_type,options_json,position,required,active
          ) VALUES(?,?,?,?,?,?,1)
        `).bind(
          id,text,type,optionsJson,i+1,q.required===false?0:1
        ).run();
        submittedIds.push(Number(result.meta.last_row_id));
      }
    }

    // "Eliminar" preguntas = desactivarlas para conservar respuestas históricas.
    if (submittedIds.length) {
      const marks = submittedIds.map(()=>"?").join(",");
      await env.DB.prepare(`
        UPDATE survey_questions
        SET active=0,updated_at=CURRENT_TIMESTAMP
        WHERE survey_id=? AND active=1 AND id NOT IN (${marks})
      `).bind(id,...submittedIds).run();
    } else {
      await env.DB.prepare(`
        UPDATE survey_questions SET active=0,updated_at=CURRENT_TIMESTAMP
        WHERE survey_id=?
      `).bind(id).run();
    }

    return json({ok:true});
  } catch (err) {
    console.error(err);
    return json({ok:false,error:"server"},500);
  }
}
