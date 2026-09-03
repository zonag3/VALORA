import { json } from "../../_lib.js";

export async function onRequestPost() {
  return json({ok:true}, 200, {
    "set-cookie":"g3_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
  });
}
