import { json, requireEnv, sbFetch, verifyAdmin } from "../../_lib.js";

function randomCode() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  const n = (a[0] % 1000000).toString().padStart(6,"0");
  return `${n.slice(0,3)}-${n.slice(3)}`;
}

export async function onRequestPost({ request, env }) {
  try {
    requireEnv(env);
    if (!(await verifyAdmin(request, env))) return json({ok:false,error:"unauthorized"},401);

    const body = await request.json().catch(()=>({}));
    const requested = Math.max(1, Math.min(500, Number(body.count || 10)));

    const created = [];
    let rounds = 0;

    while (created.length < requested && rounds < 12) {
      rounds++;
      const needed = requested - created.length;
      const candidates = [...new Set(Array.from({length:needed*2}, randomCode))];

      const res = await sbFetch(env, "codes?on_conflict=code", {
        method:"POST",
        headers:{ "Prefer":"resolution=ignore-duplicates,return=representation" },
        body:JSON.stringify(candidates.map(code=>({code})))
      });

      if (!res.ok) return json({ok:false,error:"database"},500);
      const rows = await res.json();
      created.push(...rows.map(r=>r.code));
    }

    return json({ok:true,codes:created.slice(0,requested)});
  } catch (err) {
    return json({ok:false,error:"server",detail:String(err.message || err)},500);
  }
}
