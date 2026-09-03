import { json, requireEnv, sbFetch, clientIp, normalizeCode } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  try {
    requireEnv(env);
    const body = await request.json().catch(() => ({}));
    const code = normalizeCode(body.code);
    if (!code) return json({ ok:false, error:"invalid_format" }, 400);

    const ip = clientIp(request);
    const attemptRes = await sbFetch(
      env,
      `code_attempts?ip=eq.${encodeURIComponent(ip)}&select=fails,locked_until&limit=1`
    );
    const attempts = attemptRes.ok ? await attemptRes.json() : [];
    const attempt = attempts[0];

    if (attempt?.locked_until) {
      const until = new Date(attempt.locked_until).getTime();
      if (until > Date.now()) {
        return json({
          ok:false,
          error:"locked",
          retryAfterSeconds: Math.ceil((until - Date.now())/1000)
        }, 429);
      }
    }

    const codeRes = await sbFetch(
      env,
      `codes?code=eq.${encodeURIComponent(code)}&select=id,used&limit=1`
    );
    if (!codeRes.ok) return json({ ok:false, error:"database" }, 500);

    const rows = await codeRes.json();
    const found = rows[0];

    if (!found) {
      const currentFails = Number(attempt?.fails || 0) + 1;
      const shouldLock = currentFails >= 5;
      const lockedUntil = shouldLock ? new Date(Date.now() + 10*60*1000).toISOString() : null;

      await sbFetch(env, "code_attempts?on_conflict=ip", {
        method: "POST",
        headers: { "Prefer":"resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          ip,
          fails: shouldLock ? 0 : currentFails,
          locked_until: lockedUntil,
          updated_at: new Date().toISOString()
        })
      });

      return json({
        ok:false,
        error: shouldLock ? "locked" : "invalid_code",
        attemptsLeft: shouldLock ? 0 : 5-currentFails,
        retryAfterSeconds: shouldLock ? 600 : undefined
      }, shouldLock ? 429 : 404);
    }

    if (found.used) return json({ ok:false, error:"used" }, 409);

    // Código correcto: reiniciamos intentos.
    await sbFetch(env, `code_attempts?ip=eq.${encodeURIComponent(ip)}`, {
      method: "DELETE"
    });

    return json({ ok:true, code });
  } catch (err) {
    return json({ ok:false, error:"server", detail:String(err.message || err) }, 500);
  }
}
