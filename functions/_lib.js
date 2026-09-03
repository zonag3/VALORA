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

function requireEnv(env) {
  const names = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ADMIN_USER",
    "ADMIN_PASSWORD",
    "SESSION_SECRET"
  ];
  const missing = names.filter(n => !env[n]);
  if (missing.length) {
    throw new Error(`Faltan variables de entorno: ${missing.join(", ")}`);
  }
}

function supabaseHeaders(env, extra = {}) {
  return {
    "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
    "authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
    ...extra
  };
}

async function sbFetch(env, path, options = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...supabaseHeaders(env),
      ...(options.headers || {})
    }
  });
  return res;
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") ||
         request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
         "unknown";
}

function normalizeCode(code) {
  const digits = String(code || "").replace(/\D/g, "").slice(0, 6);
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
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return bytesToBase64Url(new Uint8Array(sig));
}

async function createAdminToken(secret) {
  const payload = textToBase64Url(JSON.stringify({
    role: "admin",
    exp: Math.floor(Date.now()/1000) + 8*60*60
  }));
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

async function verifyAdmin(request, env) {
  const cookie = request.headers.get("cookie") || "";
  const raw = cookie.split(";").map(v => v.trim()).find(v => v.startsWith("g3_admin="));
  if (!raw) return false;
  const token = raw.slice("g3_admin=".length);
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = await hmac(env.SESSION_SECRET, payload);
  if (expected.length !== sig.length) return false;

  // Comparación de firma suficientemente robusta para este HMAC en runtime JS.
  let diff = 0;
  for (let i=0;i<sig.length;i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return false;

  try {
    const data = JSON.parse(base64UrlToText(payload));
    return data.role === "admin" && data.exp > Math.floor(Date.now()/1000);
  } catch {
    return false;
  }
}

export {
  json, requireEnv, sbFetch, clientIp, normalizeCode,
  createAdminToken, verifyAdmin
};
