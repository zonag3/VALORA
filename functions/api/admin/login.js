import {
  json,
  requireAdminEnv,
  createAdminToken
} from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  try {
    requireAdminEnv(env);

    const body = await request.json().catch(() => ({}));

    if (
      String(body.user || "") !== env.ADMIN_USER
      || String(body.password || "") !== env.ADMIN_PASSWORD
    ) {
      return json({ ok:false, error:"invalid_credentials" }, 401);
    }

    const token = await createAdminToken(env.SESSION_SECRET);

    return json({ ok:true }, 200, {
      "set-cookie":
        `g3_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`
    });

  } catch (err) {
    console.error(err);
    return json({ ok:false, error:"server" }, 500);
  }
}
