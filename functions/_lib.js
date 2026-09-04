function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store",
      ...extraHeaders
    }
  });
}

function requireDb(env) {
  if (!env.DB) throw new Error("Falta el binding D1 llamado DB");
}

function requireAdminEnv(env) {
  const missing = ["ADMIN_USER","ADMIN_PASSWORD","SESSION_SECRET"].filter(k => !env[k]);
  if (missing.length) throw new Error(`Faltan variables: ${missing.join(", ")}`);
}

function rawClientIp(request) {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

function normalizeCode(value) {
  const digits = String(value || "").replace(/\D/g,"").slice(0,6);
  if (digits.length !== 6) return null;
  return `${digits.slice(0,3)}-${digits.slice(3)}`;
}

function isControlCode(code) {
  return normalizeCode(code) === "333-666";
}

function isV10CodePattern(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return false;
  if (normalized === "333-666") return true;
  const [first,second] = normalized.split("-");
  if (!first || !second) return false;
  const firstOk = first[0] === first[2] && first[0] !== first[1];
  const secondOk = new Set(second.split("")).size === 3;
  return firstOk && secondOk;
}

function cleanText(value, max = 500) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0,max) : null;
}

function cleanColor(value, fallback) {
  const s = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

function textToBase64Url(text) {
  return bytesToBase64Url(new TextEncoder().encode(text));
}

function base64UrlToText(value) {
  value = value.replace(/-/g,"+").replace(/_/g,"/");
  while (value.length % 4) value += "=";
  const binary = atob(value);
  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {name:"HMAC",hash:"SHA-256"},
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return bytesToBase64Url(new Uint8Array(sig));
}

async function clientKey(request, env) {
  requireAdminEnv(env);
  return hmac(env.SESSION_SECRET, `ip:${rawClientIp(request)}`);
}

async function createAdminToken(secret) {
  const payload = textToBase64Url(JSON.stringify({
    role:"admin",
    exp:Math.floor(Date.now()/1000) + 8*60*60
  }));
  return `${payload}.${await hmac(secret,payload)}`;
}

async function verifyAdmin(request, env) {
  requireAdminEnv(env);
  const cookie = request.headers.get("cookie") || "";
  const pair = cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith("g3_admin="));
  if (!pair) return false;
  const [payload,signature] = pair.slice("g3_admin=".length).split(".");
  if (!payload || !signature) return false;
  const expected = await hmac(env.SESSION_SECRET,payload);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i=0;i<signature.length;i++) diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return false;
  try {
    const data = JSON.parse(base64UrlToText(payload));
    return data.role === "admin" && Number(data.exp) > Math.floor(Date.now()/1000);
  } catch {
    return false;
  }
}

async function getSurvey(env,id) {
  return env.DB.prepare("SELECT * FROM surveys WHERE id = ? LIMIT 1").bind(Number(id)).first();
}

async function getActiveSurvey(env) {
  return env.DB.prepare("SELECT * FROM surveys WHERE active = 1 ORDER BY id DESC LIMIT 1").first();
}

async function getQuestions(env,surveyId,activeOnly=true) {
  const sql = activeOnly
    ? "SELECT * FROM survey_questions WHERE survey_id = ? AND active = 1 ORDER BY position,id"
    : "SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY position,id";
  const result = await env.DB.prepare(sql).bind(Number(surveyId)).all();
  return result.results || [];
}

function parseOptions(raw) {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr.map(x=>String(x)).filter(Boolean).slice(0,30) : [];
  } catch {
    return [];
  }
}

function publicQuestion(q) {
  return {
    id:Number(q.id),
    text:q.question_text,
    type:q.question_type,
    options:parseOptions(q.options_json),
    position:Number(q.position),
    required:Number(q.required) === 1
  };
}

function publicSurvey(s) {
  if (!s) return null;
  return {
    id:Number(s.id),
    brandName:s.brand_name,
    eyebrow:s.eyebrow,
    title:s.title,
    introText:s.intro_text,
    accessButtonText:s.access_button_text,
    singleUseText:s.single_use_text,
    benefits:[
      {title:s.benefit1_title,text:s.benefit1_text},
      {title:s.benefit2_title,text:s.benefit2_text},
      {title:s.benefit3_title,text:s.benefit3_text}
    ],
    surveyEyebrow:s.survey_eyebrow,
    surveyTitle:s.survey_title,
    surveyDescription:s.survey_description,
    commentLabel:s.comment_label,
    commentPlaceholder:s.comment_placeholder,
    submitButtonText:s.submit_button_text,
    thanksEyebrow:s.thanks_eyebrow,
    thanksTitle:s.thanks_title,
    thanksText:s.thanks_text,
    heroImageUrl:s.hero_image_url,
    showHeroImage:Number(s.show_hero_image) === 1,
    allowComments:Number(s.allow_comments) === 1,
    accentColor:s.accent_color,
    headerColor:s.header_color,
    active:Number(s.active) === 1
  };
}

function randomDigit(excluded = new Set()) {
  const allowed = [];
  for (let i=0;i<=9;i++) if (!excluded.has(String(i))) allowed.push(String(i));
  const max = Math.floor(0x100000000 / allowed.length) * allowed.length;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= max);
  return allowed[buf[0] % allowed.length];
}

function randomV10Code() {
  const a = randomDigit();
  const b = randomDigit(new Set([a]));
  const c = randomDigit();
  const d = randomDigit(new Set([c]));
  const e = randomDigit(new Set([c,d]));
  const code = `${a}${b}${a}-${c}${d}${e}`;
  return code === "333-666" ? randomV10Code() : code;
}

export {
  json,requireDb,requireAdminEnv,rawClientIp,clientKey,
  normalizeCode,isControlCode,isV10CodePattern,cleanText,cleanColor,
  createAdminToken,verifyAdmin,getSurvey,getActiveSurvey,getQuestions,
  parseOptions,publicQuestion,publicSurvey,randomV10Code
};
