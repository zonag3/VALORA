import {
  json,
  requireDb,
  verifyAdmin
} from "../../_lib.js";

function randomCode() {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  const n = (random[0] % 1000000).toString().padStart(6,"0");
  return `${n.slice(0,3)}-${n.slice(3)}`;
}

export async function onRequestPost({ request, env }) {
  try {
    requireDb(env);

    if (!(await verifyAdmin(request, env))) {
      return json({ ok:false, error:"unauthorized" }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const count = Math.max(1, Math.min(500, Number(body.count || 10)));
    const created = [];

    let rounds = 0;

    while (created.length < count && rounds < 20) {
      rounds++;

      const needed = count - created.length;
      const candidates = [
        ...new Set(Array.from({ length:needed * 3 }, randomCode))
      ];

      const statements = candidates.map(code =>
        env.DB.prepare(
          "INSERT OR IGNORE INTO codes(code) VALUES (?)"
        ).bind(code)
      );

      const results = await env.DB.batch(statements);

      results.forEach((result, i) => {
        if (Number(result?.meta?.changes || 0) === 1) {
          created.push(candidates[i]);
        }
      });
    }

    return json({
      ok:true,
      codes:created.slice(0,count)
    });

  } catch (err) {
    console.error(err);
    return json({ ok:false, error:"server" }, 500);
  }
}
