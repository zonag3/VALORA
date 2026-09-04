import { json,requireDb,getActiveSurvey,getQuestions,publicSurvey,publicQuestion } from "../_lib.js";

export async function onRequestGet({env}) {
  try {
    requireDb(env);
    const survey = await getActiveSurvey(env);
    if (!survey) return json({ok:true,survey:null,questions:[]});
    const questions = await getQuestions(env,survey.id,true);
    return json({
      ok:true,
      survey:publicSurvey(survey),
      questions:questions.map(publicQuestion)
    });
  } catch (err) {
    console.error(err);
    return json({ok:false,error:"server"},500);
  }
}
