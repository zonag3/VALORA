import { json, requireDb, clientIp, normalizeCode } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  try {
    requireDb(env);

    const body = await request.json().catch(() => ({}));
    const code = normalizeCode(body.code);

    if (!code) {
      return json({ ok:false, error:"invalid_format" }, 400);
    }

    const ip = clientIp(request);
    const now = Math.floor(Date.now() / 1000);

    const attempt = await env.DB
      .prepare("SELECT fails, locked_until FROM code_attempts WHERE ip = ?")
      .bind(ip)
      .first();

    if (attempt?.locked_until && Number(attempt.locked_until) > now) {
      return json({
        ok:false,
        error:"locked",
        retryAfterSeconds:Number(attempt.locked_until) - now
      }, 429);
    }

    const found = await env.DB
      .prepare("SELECT id, used FROM codes WHERE code = ? LIMIT 1")
      .bind(code)
      .first();

    if (!found) {
      const currentFails = Number(attempt?.fails || 0) + 1;
      const lockNow = currentFails >= 5;
      const lockedUntil = lockNow ? now + 600 : null;
      const storedFails = lockNow ? 0 : currentFails;

      await env.DB.prepare(`
        INSERT INTO code_attempts(ip, fails, locked_until, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(ip) DO UPDATE SET
          fails = excluded.fails,
          locked_until = excluded.locked_until,
          updated_at = excluded.updated_at
      `).bind(ip, storedFails, lockedUntil, now).run();

      return json({
        ok:false,
        error:lockNow ? "locked" : "invalid_code",
        attemptsLeft:lockNow ? 0 : 5-currentFails,
        retryAfterSeconds:lockNow ? 600 : undefined
      }, lockNow ? 429 : 404);
    }

    if (Number(found.used) === 1) {
      return json({ ok:false, error:"used" }, 409);
    }

    await env.DB
      .prepare("DELETE FROM code_attempts WHERE ip = ?")
      .bind(ip)
      .run();

    return json({ ok:true, code });

  } catch (err) {
    console.error(err);
    return json({ ok:false, error:"server" }, 500);
  }
}
