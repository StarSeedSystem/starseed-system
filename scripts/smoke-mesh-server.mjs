// Smoke test del servidor de referencia (Adenda 107): endpoints, auth, hops, verify.
import { spawn } from "node:child_process";
import { webcrypto } from "node:crypto";

const SERVER = "docs/examples/starseed-mesh-server/index.mjs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  OK ", m); } else { fail++; console.log("  XX ", m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(port, env) {
  const p = spawn("node", [SERVER], { env: { ...process.env, PORT: String(port), ...env }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((res) => { p.stdout.on("data", (d) => { if (String(d).includes("mesh server")) res(); }); setTimeout(res, 1500); });
  return p;
}

// b64url de la firma para el sobre {v:1,b,s,k,f}
function b64url(buf) { return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }

async function makeSigned(body) {
  const kp = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await webcrypto.subtle.exportKey("jwk", kp.publicKey);
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  const sig = await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, bytes);
  return { v: 1, b: body, s: b64url(sig), k: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, f: "id:test" };
}

async function main() {
  // ── 1. Servidor abierto (memoria, sin auth) ──
  let srv = await boot(8801, {});
  let r = await fetch("http://localhost:8801/mesh/public", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id: "dev-a", envelope: { cls: "P2", ptype: "post", body: { text: "hola" }, oid: "oid-1", at: Date.now() } }) });
  ok(r.status === 200, "POST /mesh/public → 200 (abierto)");
  r = await fetch("http://localhost:8801/mesh/public?since=0"); let j = await r.json();
  ok(Array.isArray(j.items) && j.items.some((i) => i.oid === "oid-1"), "GET /mesh/public devuelve el item");
  ok(j.items.find((i) => i.oid === "oid-1")?.hops === 0, "item propio tiene hops=0");
  // dedup por oid
  await fetch("http://localhost:8801/mesh/public", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id: "dev-a", envelope: { body: { text: "dup" }, oid: "oid-1", at: Date.now() } }) });
  r = await fetch("http://localhost:8801/mesh/public?since=0"); j = await r.json();
  ok(j.items.filter((i) => i.oid === "oid-1").length === 1, "dedup por oid (segundo POST ignorado)");
  // Reloj lógico: el servidor round-trip del campo lc (Adenda 115).
  await fetch("http://localhost:8801/mesh/public", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id: "dev-b", envelope: { body: { text: "con reloj" }, oid: "oid-lc", lc: 42, at: Date.now() } }) });
  r = await fetch("http://localhost:8801/mesh/public?since=0"); j = await r.json();
  ok(j.items.find((i) => i.oid === "oid-lc")?.lc === 42, "reloj lógico lc round-trip en el servidor");
  // relay dirigido
  r = await fetch("http://localhost:8801/mesh/relay", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id: "dev-a", envelope: { recipient: "acct-x", body: { text: "privado" }, oid: "oid-r1", at: Date.now() } }) });
  ok(r.status === 200, "POST /mesh/relay → 200");
  r = await fetch("http://localhost:8801/mesh/relay?recipient=acct-x&since=0"); j = await r.json();
  ok(j.items.some((i) => i.oid === "oid-r1"), "GET /mesh/relay?recipient=acct-x devuelve el buzón");
  srv.kill();

  // ── 2. Auth de grupo (STARSEED_TOKENS) ──
  srv = await boot(8802, { STARSEED_TOKENS: JSON.stringify({ "tok-1": ["acct-x"] }) });
  r = await fetch("http://localhost:8802/mesh/public", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id: "d", envelope: { body: { t: "1" }, oid: "o", at: Date.now() } }) });
  ok(r.status === 401, "POST sin token → 401");
  r = await fetch("http://localhost:8802/mesh/public", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer tok-1" },
    body: JSON.stringify({ device_id: "d", envelope: { body: { t: "1" }, oid: "o", at: Date.now() } }) });
  ok(r.status === 200, "POST con Bearer válido → 200");
  r = await fetch("http://localhost:8802/mesh/relay?recipient=acct-y&token=tok-1"); // tok-1 solo puede leer acct-x
  ok(r.status === 403, "GET buzón ajeno (token no cubre recipient) → 403");
  r = await fetch("http://localhost:8802/mesh/relay?recipient=acct-x&token=tok-1");
  ok(r.status === 200, "GET buzón propio (token cubre recipient) → 200");
  srv.kill();

  // ── 2b. Expiración de tokens (Adenda 108) ──
  srv = await boot(8805, { STARSEED_TOKENS: JSON.stringify({
    "tok-live": { ids: ["acct-x"], exp: Date.now() + 3600_000 },
    "tok-dead": { ids: ["acct-x"], exp: Date.now() - 1000 },
  }) });
  r = await fetch("http://localhost:8805/mesh/public", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer tok-live" },
    body: JSON.stringify({ device_id: "d", envelope: { body: { t: "1" }, oid: "o-live", at: Date.now() } }) });
  ok(r.status === 200, "token con exp futura → 200");
  r = await fetch("http://localhost:8805/mesh/public", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer tok-dead" },
    body: JSON.stringify({ device_id: "d", envelope: { body: { t: "1" }, oid: "o-dead", at: Date.now() } }) });
  ok(r.status === 401, "token caducado → 401");
  r = await fetch("http://localhost:8805/mesh/relay?recipient=acct-x&token=tok-dead");
  ok(r.status === 403, "buzón con token caducado → 403");
  r = await fetch("http://localhost:8805/mesh/relay?recipient=acct-x&token=tok-live");
  ok(r.status === 200, "buzón con token vigente → 200");
  srv.kill();

  // ── 2c. Ciclo de vida de tokens (Adenda 116) ──
  srv = await boot(8807, { STARSEED_ADMIN_TOKEN: "admin-key" });
  const admin = { authorization: "Bearer admin-key", "content-type": "application/json" };
  r = await fetch("http://localhost:8807/tokens/issue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: ["acct-x"] }) });
  ok(r.status === 401, "emitir token sin admin → 401");
  r = await fetch("http://localhost:8807/tokens/issue", { method: "POST", headers: admin, body: JSON.stringify({ ids: ["acct-x"], ttlMs: 60000 }) });
  const issued = await r.json();
  ok(r.status === 200 && typeof issued.token === "string" && issued.token.startsWith("tk_"), "admin emite un token");
  r = await fetch("http://localhost:8807/mesh/public", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${issued.token}` },
    body: JSON.stringify({ device_id: "d", envelope: { body: { t: "1" }, oid: "o-dyn", at: Date.now() } }) });
  ok(r.status === 200, "escribe con token emitido → 200");
  r = await fetch("http://localhost:8807/mesh/relay?recipient=acct-x&token=" + issued.token);
  ok(r.status === 200, "lee buzón cubierto por el token emitido → 200");
  const expBefore = issued.exp;
  await sleep(5);
  r = await fetch("http://localhost:8807/tokens/refresh", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${issued.token}` }, body: "{}" });
  const refreshed = await r.json();
  ok(r.status === 200 && refreshed.exp >= expBefore, "refresh renueva la caducidad");
  r = await fetch("http://localhost:8807/tokens/revoke", { method: "POST", headers: admin, body: JSON.stringify({ token: issued.token }) });
  ok(r.status === 200, "admin revoca el token → 200");
  r = await fetch("http://localhost:8807/mesh/public", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${issued.token}` },
    body: JSON.stringify({ device_id: "d", envelope: { body: { t: "2" }, oid: "o-dyn2", at: Date.now() } }) });
  ok(r.status === 401, "token revocado → 401");
  srv.kill();

  // ── 2d. Orden por reloj lógico en el servidor (Adenda 116) ──
  srv = await boot(8808, {});
  for (const [oid, lc] of [["a", 5], ["b", 1], ["c", 9]]) {
    await fetch("http://localhost:8808/mesh/public", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_id: "d", envelope: { body: { t: oid }, oid: `lc-${oid}`, lc, at: Date.now() } }) });
  }
  r = await fetch("http://localhost:8808/mesh/public?since=0"); j = await r.json();
  const lcOrder = j.items.filter((i) => String(i.oid).startsWith("lc-")).map((i) => i.lc);
  ok(lcOrder[0] === 9 && lcOrder[lcOrder.length - 1] === 1, "el servidor ordena por lc (desc)");
  srv.kill();

  // ── 3. VERIFY: solo firma válida en público ──
  srv = await boot(8803, { STARSEED_VERIFY: "1" });
  const signed = await makeSigned({ text: "firmado" });
  r = await fetch("http://localhost:8803/mesh/public", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id: "d", envelope: { body: signed, oid: "oid-signed", at: Date.now() } }) });
  ok(r.status === 200, "VERIFY: POST con firma válida → 200");
  const tampered = { ...signed, b: { text: "manipulado" } };
  r = await fetch("http://localhost:8803/mesh/public", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id: "d", envelope: { body: tampered, oid: "oid-bad", at: Date.now() } }) });
  ok(r.status === 400, "VERIFY: POST con firma manipulada → 400");
  r = await fetch("http://localhost:8803/mesh/public", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id: "d", envelope: { body: { text: "sin firma" }, oid: "oid-plain", at: Date.now() } }) });
  ok(r.status === 400, "VERIFY: POST sin firma → 400");
  srv.kill();

  // ── 4. SSE (realtime) ──
  srv = await boot(8804, {});
  const es = await fetch("http://localhost:8804/mesh/stream?recipients=acct-z", { headers: { accept: "text/event-stream" } });
  const reader = es.body.getReader();
  let received = null;
  const readPromise = (async () => {
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const m = buf.match(/data: (\{.*\})/);
      if (m) { received = JSON.parse(m[1]); break; }
    }
  })();
  await sleep(200);
  await fetch("http://localhost:8804/mesh/public", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id: "d", envelope: { body: { t: "live" }, oid: "oid-live", at: Date.now() } }) });
  await Promise.race([readPromise, sleep(1500)]);
  ok(received && received.oid === "oid-live" && received.channel === "public", "SSE empuja el item público al instante");
  try { await reader.cancel(); } catch { /* */ }
  srv.kill();

  console.log(`\n${pass} pasan / ${fail} fallan`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
