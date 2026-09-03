function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

function requireDb(env) {
  if (!env.DB) throw new Error("Falta el binding D1 llamado DB");
}

function requireAdminEnv(env) {
  const missing = ["ADMIN_USER", "ADMIN_PASSWORD", "SESSION_SECRET"].filter(k => !env[k]);
  if (missing.length) throw new Error(`Faltan variables: ${missing.join(", ")}`);
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

function normalizeCode(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 6);
  if (digits.length !== 6) return null;
  return `${digits.slice(0,3)}-${digits.slice(3)}`;
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
    { name:"HMAC", hash:"SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(text)
  );
  return bytesToBase64Url(new Uint8Array(sig));
}

async function createAdminToken(secret) {
  const payload = textToBase64Url(JSON.stringify({
    role:"admin",
    exp:Math.floor(Date.now()/1000) + 8*60*60
  }));
  return `${payload}.${await hmac(secret, payload)}`;
}

async function verifyAdmin(request, env) {
  requireAdminEnv(env);

  const cookie = request.headers.get("cookie") || "";
  const pair = cookie.split(";")
    .map(x => x.trim())
    .find(x => x.startsWith("g3_admin="));

  if (!pair) return false;

  const token = pair.slice("g3_admin=".length);
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = await hmac(env.SESSION_SECRET, payload);
  if (expected.length !== signature.length) return false;

  let diff = 0;
  for (let i=0; i<signature.length; i++) {
    diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return false;

  try {
    const data = JSON.parse(base64UrlToText(payload));
    return data.role === "admin"
      && Number(data.exp) > Math.floor(Date.now()/1000);
  } catch {
    return false;
  }
}

export {
  json,
  requireDb,
  requireAdminEnv,
  clientIp,
  normalizeCode,
  createAdminToken,
  verifyAdmin
};
