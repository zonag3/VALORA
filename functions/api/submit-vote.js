import { json, requireDb, normalizeCode } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  try {
    requireDb(env);

    const body = await request.json().catch(() => ({}));
    const code = normalizeCode(body.code);
    const answers = Array.isArray(body.answers)
      ? body.answers.map(Number)
      : [];

    if (
      !code
      || answers.length !== 5
      || answers.some(v => !Number.isInteger(v) || v < 1 || v > 5)
    ) {
      return json({ ok:false, error:"invalid_data" }, 400);
    }

    const comment = String(body.comment || "").trim().slice(0,500);
    const average = answers.reduce((a,b) => a+b, 0) / answers.length;

    // INSERT OR IGNORE + UNIQUE(code_id) impide doble voto incluso
    // si llegan dos peticiones prácticamente al mismo tiempo.
    const insert = env.DB.prepare(`
      INSERT OR IGNORE INTO votes (
        code_id, q1, q2, q3, q4, q5, comment, average
      )
      SELECT id, ?, ?, ?, ?, ?, ?, ?
      FROM codes
      WHERE code = ? AND used = 0
    `).bind(
      answers[0], answers[1], answers[2], answers[3], answers[4],
      comment || null,
      average,
      code
    );

    // Marcamos el código como usado solo cuando exista un voto asociado.
    const markUsed = env.DB.prepare(`
      UPDATE codes
      SET used = 1,
          used_at = CURRENT_TIMESTAMP
      WHERE code = ?
        AND EXISTS (
          SELECT 1 FROM votes WHERE votes.code_id = codes.id
        )
    `).bind(code);

    const results = await env.DB.batch([insert, markUsed]);
    const inserted = Number(results?.[0]?.meta?.changes || 0);

    if (inserted === 1) {
      return json({ ok:true });
    }

    const found = await env.DB
      .prepare("SELECT id, used FROM codes WHERE code = ? LIMIT 1")
      .bind(code)
      .first();

    if (!found) return json({ ok:false, error:"invalid_code" }, 404);

    return json({ ok:false, error:"used" }, 409);

  } catch (err) {
    console.error(err);
    return json({ ok:false, error:"server" }, 500);
  }
}
